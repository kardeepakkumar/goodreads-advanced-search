import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { GenresResponse } from '@/types'

export async function GET() {
  try {
    const db = await getDb()
    const genres = await db
      .collection('genres')
      .find({}, { projection: { _id: 1 } })
      .sort({ _id: 1 })
      .toArray()

    const body: GenresResponse = { genres: genres.map((g) => g._id as unknown as string) }
    return NextResponse.json(body)
  } catch (err) {
    console.error('/api/genres error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
