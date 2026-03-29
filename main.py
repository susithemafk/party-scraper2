import asyncio
import json
import os
from src.scraper import process_batch


async def main():
    input_file = "input.json"
    output_file = "output.json"

    if not os.path.exists(input_file):
        print(f"Error: {input_file} not found.")
        return

    with open(input_file, 'r', encoding='utf-8') as f:
        input_data = json.load(f)

    print(f"Loaded input data for {len(input_data)} venues.")

    # Run the batch processing
    results = await process_batch(input_data)

    # Save results
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=4, ensure_ascii=False)

    print(f"\nProcessing complete. Results saved to {output_file}")

if __name__ == "__main__":
    asyncio.run(main())
