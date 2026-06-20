import { NextResponse } from 'next/server'
import { getConfig } from '@/lib/config'

export async function GET(): Promise<Response> {
  return NextResponse.json({
    version: await getConfig('ws_app_version'),
    notes: await getConfig('ws_update_notes'),
    forceUpdate: (await getConfig('ws_force_update')) === '1'
  })
}
