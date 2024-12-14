import json

def convert_jl_to_json(input_path, output_path):
    books = []
    with open(input_path, 'r', encoding='utf-8') as infile:
        for line in infile:
            books.append(json.loads(line))

    with open(output_path, 'w', encoding='utf-8') as outfile:
        json.dump(books, outfile, indent=2)

    print(f"Converted JL to JSON and saved at {output_path}")

convert_jl_to_json('books_raw.jl', 'github_page/books.json')