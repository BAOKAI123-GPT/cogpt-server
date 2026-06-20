import { NextResponse } from 'next/server'
import { getWsTiers } from '@/lib/config'

export async function GET(): Promise<Response> {
  return NextResponse.json({ tiers: await getWsTiers() })
}
