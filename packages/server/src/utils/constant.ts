const configuredSecret = Deno.env.get('JWT_SECRET')

if (!configuredSecret) {
  throw new Error('JWT_SECRET is required')
}

export const SECRET: string = configuredSecret
