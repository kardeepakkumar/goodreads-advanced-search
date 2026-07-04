// Builds HTML in the shape of a current Goodreads shelf page (see
// docs/scraping-architecture.md): books live in `.leftContainer .elementList`,
// ratings in `<span class="greyText smallText">` with text like
// "avg rating 3.68 — 7,380,157 ratings — published 2005".

export interface ShelfBookFixture {
  href?: string
  title: string
  author: string
  ratingText?: string
}

export function shelfPageHtml(books: ShelfBookFixture[]): string {
  const items = books
    .map(
      (b) => `
      <div class="elementList">
        <div class="left">
          ${b.href !== undefined ? `<a class="bookTitle" href="${b.href}">${b.title}</a>` : `<span class="bookTitle">${b.title}</span>`}
          <span class="by smallText">by</span>
          <a class="authorName" href="/author/show/1"><span itemprop="name">${b.author}</span></a>
          ${b.ratingText !== undefined ? `<span class="greyText smallText">${b.ratingText}</span>` : ''}
        </div>
      </div>`
    )
    .join('\n')
  return `<!DOCTYPE html><html><body><div class="mainContentFloat"><div class="leftContainer">${items}</div></div></body></html>`
}

export function fullShelfPage(genre: string, count = 50): ShelfBookFixture[] {
  return Array.from({ length: count }, (_, i) => ({
    href: `/book/show/${i + 1}.${genre}-book-${i + 1}`,
    title: `${genre} book ${i + 1}`,
    author: `Author ${i + 1}`,
    ratingText: `avg rating 4.0${i % 10} — ${(i + 1) * 1000} ratings — published 2001`,
  }))
}
