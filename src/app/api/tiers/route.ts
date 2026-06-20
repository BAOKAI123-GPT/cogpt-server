import { NextResponse } from 'next/server'
import { getTiers } from '@/lib/config'

export async function GET(): Promise<Response> {
  return NextResponse.json({ tiers: await getTiers() })
}
