import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { Int32 } from 'mongodb'
import { sessionOptions, SessionData } from '@/lib/auth'
import { getDb } from '@/lib/mongodb'
import { getAliasMap, hasAliases, canonicalGenresExpr, sourcesFor } from '@/lib/aliases'

async function requireAuth(req: NextRequest) {
  const res = NextResponse.json({})
  const session = await getIronSession<SessionData>(req, res, sessionOptions)
  return session.isLoggedIn
}

// Overview for the admin panel: every original (raw) genre with its book
// count and where it is merged, plus every merged genre with its sources and
// a deduplicated book count.
export async function GET(req: NextRequest) {
  if (!(await requireAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = await getDb()
    const aliasMap = await getAliasMap(db)

    const [genreDocs, rawCounts] = await Promise.all([
      db.collection('genres').find({}, { projection: { _id: 1 } }).sort({ _id: 1 }).toArray(),
      db
        .collection('books')
        .aggregate([
          { $unwind: '$genres' },
          { $group: { _id: '$genres', count: { $sum: 1 } } },
        ])
        .toArray(),
    ])

    const countByRaw: Record<string, number> = {}
    for (const c of rawCounts) countByRaw[String(c._id)] = c.count as number

    // Originals = registered genres ∪ tags actually present on books.
    const originalNames = [
      ...new Set([...genreDocs.map((g) => String(g._id)), ...Object.keys(countByRaw)]),
    ].sort()
    const originals = originalNames.map((genre) => ({
      genre,
      count: countByRaw[genre] ?? 0,
      mergedInto: aliasMap[genre] ?? null,
    }))

    // Merged genres with per-group book counts, each book counted once even
    // when it carries several raw sources of the same canonical.
    const canonicals = [...new Set(Object.values(aliasMap))].sort()
    let merges: { canonical: string; sources: string[]; count: number }[] = []
    if (hasAliases(aliasMap)) {
      const allSources = canonicals.flatMap((c) => sourcesFor(c, aliasMap))
      const groupCounts = await db
        .collection('books')
        .aggregate([
          { $match: { genres: { $in: allSources } } },
          { $project: { canon: canonicalGenresExpr(aliasMap) } },
          { $unwind: '$canon' },
          { $match: { canon: { $in: canonicals } } },
          { $group: { _id: '$canon', count: { $sum: 1 } } },
        ])
        .toArray()
      const countByCanonical: Record<string, number> = {}
      for (const c of groupCounts) countByCanonical[String(c._id)] = c.count as number

      merges = canonicals.map((canonical) => ({
        canonical,
        sources: Object.keys(aliasMap)
          .filter((a) => aliasMap[a] === canonical)
          .sort(),
        count: countByCanonical[canonical] ?? 0,
      }))
    }

    return NextResponse.json({ originals, merges })
  } catch (err) {
    console.error('/api/admin/aliases GET error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Merge one genre into another: { from, into }. The target may be brand new —
// it becomes a merged genre by virtue of the alias pointing at it. Raw tags
// on books are never touched, so a merge is always reversible via DELETE.
export async function POST(req: NextRequest) {
  if (!(await requireAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const from = typeof body.from === 'string' ? body.from.trim() : ''
  const into = typeof body.into === 'string' ? body.into.trim() : ''

  if (!from || !into) {
    return NextResponse.json({ error: 'from and into are required' }, { status: 400 })
  }
  if (from === into) {
    return NextResponse.json({ error: 'Cannot merge a genre into itself' }, { status: 400 })
  }

  try {
    const db = await getDb()
    const aliasMap = await getAliasMap(db)

    // Mappings stay flat — merging into a genre that is itself merged away
    // would create a chain nothing resolves.
    if (into in aliasMap) {
      return NextResponse.json(
        { error: `"${into}" is already merged into "${aliasMap[into]}" — merge into "${aliasMap[into]}" instead` },
        { status: 409 }
      )
    }

    const now = new Date()

    // If `from` is currently a merge target, its whole group follows it.
    const repoint = await db.collection('genreAliases').updateMany(
      { canonical: from },
      { $set: { canonical: into, updatedAt: now } }
    )

    await db.collection('genreAliases').updateOne(
      { _id: from as any },
      {
        $set: { canonical: into, updatedAt: now },
        $setOnInsert: { schemaVersion: new Int32(1), createdAt: now },
      },
      { upsert: true }
    )

    return NextResponse.json({ ok: true, from, into, repointed: repoint.modifiedCount ?? 0 })
  } catch (err) {
    console.error('/api/admin/aliases POST error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Split a merged genre: every tag merged into it goes back to being an
// original genre. ?canonical=<name>
export async function DELETE(req: NextRequest) {
  if (!(await requireAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const canonical = req.nextUrl.searchParams.get('canonical')?.trim()
  if (!canonical) {
    return NextResponse.json({ error: 'canonical is required' }, { status: 400 })
  }

  try {
    const db = await getDb()
    const result = await db.collection('genreAliases').deleteMany({ canonical })
    if ((result.deletedCount ?? 0) === 0) {
      return NextResponse.json({ error: `No merged genre named "${canonical}"` }, { status: 404 })
    }
    return NextResponse.json({ ok: true, canonical, released: result.deletedCount })
  } catch (err) {
    console.error('/api/admin/aliases DELETE error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
