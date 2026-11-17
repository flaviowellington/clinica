import './env'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client'

export const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  // Bytes da foto só vêm quando pedidos (select: { foto: true }): senão iam junto em todo include.
  omit: { pessoa: { foto: true }, usuario: { foto: true } },
})
