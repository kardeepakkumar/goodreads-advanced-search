import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { getAliasMap } from '@/lib/aliases'
import { GenresResponse } from '@/types'

export async function GET() {
  try {
    const db = await getDb()
    const genres = await db
      .collection('genres')
      .find({}, { projection: { _id: 1 } })
      .sort({ _id: 1 })
      .toArray()

    // Merged-genre view: tags merged away disappear from the list and their
    // canonical names appear instead (even when the canonical was newly
    // created by a merge and is not an original genre itself).
    const aliasMap = await getAliasMap(db)
    const originals = genres.map((g) => g._id as unknown as string)
    const display = [
      ...originals.filter((g) => !(g in aliasMap)),
      ...Object.values(aliasMap),
    ]
    const deduped = [...new Set(display)].sort()

    const body: GenresResponse = { genres: deduped }
    return NextResponse.json(body)
  } catch (err) {
    console.error('/api/genres error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
