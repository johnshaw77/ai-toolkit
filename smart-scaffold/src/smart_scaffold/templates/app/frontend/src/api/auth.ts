import { http } from './client'

export interface User {
  id: string
  email: string
  full_name: string
  role: 'ADMIN' | 'USER'
  is_active: boolean
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  user: User
}

export async function login(email: string, password: string): Promise<TokenResponse> {
  const { data } = await http.post<TokenResponse>('/auth/login', { email, password })
  return data
}

export async function logout(refreshToken: string): Promise<void> {
  await http.post('/auth/logout', { refresh_token: refreshToken })
}

export async function fetchMe(): Promise<User> {
  const { data } = await http.get<User>('/auth/me')
  return data
}
