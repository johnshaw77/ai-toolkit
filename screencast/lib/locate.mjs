/**
 * 把字串裡的 regex 特殊字元跳脫掉。按鈕文字常有「儲存 (Ctrl+S)」這種括號、加號，
 * 直接丟進 new RegExp() 會變成別的意思，甚至直接丟例外。
 */
export function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 決定一個 step 要怎麼定位元素，回傳純資料（不碰 page），方便單獨測試。
 *
 * 可用的定位方式，依優先順序：
 *   selector    — CSS selector
 *   role(+name) — ARIA role；name 是字串時做「包含」比對（特殊字元會跳脫），
 *                 給 RegExp 就照 RegExp 比，搭配 exact:true 則要完全相同
 *   placeholder — 輸入框的 placeholder 文字
 *   text        — 可見文字（getByText）。**fill 不吃這個**：fill 的 text 是
 *                 「要輸入的內容」，拿它去定位會找錯東西。
 */
export function locatorSpec(step) {
  if (step.selector) return { by: 'selector', selector: step.selector };

  if (step.role) {
    const options = {};
    if (step.name != null) {
      if (step.name instanceof RegExp) options.name = step.name;
      else if (step.exact) {
        options.name = String(step.name);
        options.exact = true;
      } else options.name = new RegExp(escapeRegExp(step.name));
    }
    return { by: 'role', role: step.role, options };
  }

  if (step.placeholder) return { by: 'placeholder', placeholder: step.placeholder, exact: step.exact ?? false };

  if (step.type === 'fill') {
    throw new Error(
      `step "${step.label ?? 'fill'}" 沒有指定要填哪個輸入框——fill 的 text 是要輸入的內容，` +
      '不能拿來定位；請用 selector / role+name / placeholder',
    );
  }

  if (step.text) return { by: 'text', text: step.text, exact: step.exact ?? false };

  throw new Error(`step "${step.label ?? step.type}" 缺少 selector / role / placeholder / text 其中一種定位方式`);
}

/** fill 要輸入的內容：優先用 value；舊的 scenario 寫在 text，照樣接受。 */
export function fillValue(step) {
  return String(step.value ?? step.text ?? '');
}

export function locate(page, step) {
  const spec = locatorSpec(step);
  switch (spec.by) {
    case 'selector':
      return page.locator(spec.selector).first();
    case 'role':
      return page.getByRole(spec.role, spec.options).first();
    case 'placeholder':
      return page.getByPlaceholder(spec.placeholder, { exact: spec.exact }).first();
    case 'text':
      return page.getByText(spec.text, { exact: spec.exact }).first();
    default:
      throw new Error(`未知的定位方式: ${spec.by}`);
  }
}
