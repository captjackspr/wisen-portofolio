import os
import re
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv


# Lokasi root proyek
ROOT_DIR = Path(__file__).resolve().parents[2]
OUTPUT_DIR = ROOT_DIR / "assets" / "images" / "source"

# Membaca API key dari .env
load_dotenv(ROOT_DIR / ".env")
API_KEY = os.getenv("PEXELS_API_KEY")


PEXELS_SEARCH_URL = "https://api.pexels.com/v1/search"


def safe_filename(text):
    """Mengubah teks menjadi nama file yang aman."""
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-") or "pexels-image"


def download_file(url, destination):
    """Mengunduh satu gambar."""
    response = requests.get(url, timeout=60)
    response.raise_for_status()

    destination.write_bytes(response.content)


def search_and_download(query, amount=8, orientation="landscape"):
    """Mencari dan mengunduh foto dari Pexels."""

    if not API_KEY:
        print("ERROR: PEXELS_API_KEY belum ditemukan.")
        print("Buat file .env di folder utama proyek, lalu isi:")
        print("PEXELS_API_KEY=api_key_kamu")
        sys.exit(1)

    if amount < 1 or amount > 80:
        print("ERROR: Jumlah gambar harus antara 1 sampai 80.")
        sys.exit(1)

    allowed_orientations = {"landscape", "portrait", "square"}

    if orientation not in allowed_orientations:
        print("ERROR: Orientasi harus landscape, portrait, atau square.")
        sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    headers = {
        "Authorization": API_KEY
    }

    params = {
        "query": query,
        "per_page": amount,
        "orientation": orientation,
        "page": 1
    }

    print(f'Mencari {amount} foto untuk: "{query}"...')

    try:
        response = requests.get(
            PEXELS_SEARCH_URL,
            headers=headers,
            params=params,
            timeout=30
        )

        if response.status_code == 401:
            print("ERROR 401: API key Pexels tidak valid.")
            print("Periksa kembali PEXELS_API_KEY di file .env.")
            sys.exit(1)

        if response.status_code == 429:
            print("ERROR 429: Batas penggunaan Pexels API sudah tercapai.")
            sys.exit(1)

        response.raise_for_status()

    except requests.RequestException as error:
        print(f"Gagal menghubungi Pexels API: {error}")
        sys.exit(1)

    data = response.json()
    photos = data.get("photos", [])

    if not photos:
        print("Tidak ada foto yang ditemukan.")
        return

    query_slug = safe_filename(query)
    successful_downloads = 0

    for index, photo in enumerate(photos, start=1):
        photographer = photo.get("photographer", "Unknown")
        photo_id = photo.get("id", index)
        source = photo.get("src", {})

        # Gunakan resolusi large2x; fallback ke large/original.
        image_url = (
            source.get("large2x")
            or source.get("large")
            or source.get("original")
        )

        if not image_url:
            print(f"[{index}] URL gambar tidak tersedia, dilewati.")
            continue

        filename = f"{query_slug}-{photo_id}.jpg"
        destination = OUTPUT_DIR / filename

        try:
            print(f"[{index}/{len(photos)}] Mengunduh {filename}...")
            download_file(image_url, destination)
            successful_downloads += 1

            print(f"    Fotografer: {photographer}")

        except requests.RequestException as error:
            print(f"    Gagal: {error}")

    print()
    print("Proses selesai.")
    print(f"Berhasil diunduh: {successful_downloads} gambar")
    print(f"Lokasi: {OUTPUT_DIR}")


if __name__ == "__main__":
    search_and_download(
        query="dark minimalist developer workspace",
        amount=8,
        orientation="landscape"
    )
