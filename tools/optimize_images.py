from pathlib import Path
from PIL import Image, ImageOps
import pillow_heif

pillow_heif.register_heif_opener()

ROOT_DIR = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT_DIR / "assets" / "images" / "source"
OUTPUT_DIR = ROOT_DIR / "assets" / "images" / "optimized"

SIZES = {
    "sm": 480,
    "md": 960,
    "lg": 1600,
}

SUPPORTED_FORMATS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".heic",
    ".heif",
}

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def optimize_image(source_path):
    try:
        with Image.open(source_path) as image:
            image = ImageOps.exif_transpose(image).convert("RGB")

            for size_name, max_width in SIZES.items():
                resized_image = image.copy()

                if resized_image.width > max_width:
                    ratio = max_width / resized_image.width
                    new_height = round(resized_image.height * ratio)

                    resized_image = resized_image.resize(
                        (max_width, new_height),
                        Image.Resampling.LANCZOS,
                    )

                output_path = (
                    OUTPUT_DIR
                    / f"{source_path.stem}-{size_name}.webp"
                )

                resized_image.save(
                    output_path,
                    "WEBP",
                    quality=82,
                    method=6,
                    optimize=True,
                )

                print(f"Berhasil: {output_path.name}")

    except Exception as error:
        print(f"Gagal memproses {source_path.name}: {error}")


def main():
    files = [
        path
        for path in SOURCE_DIR.iterdir()
        if path.is_file() and path.suffix.lower() in SUPPORTED_FORMATS
    ]

    if not files:
        print(f"Tidak ada gambar di: {SOURCE_DIR}")
        return

    print(f"Ditemukan {len(files)} gambar.")
    print("Memulai optimasi...\n")

    for index, source_path in enumerate(files, start=1):
        print(f"[{index}/{len(files)}] {source_path.name}")
        optimize_image(source_path)

    print("\nProses optimasi selesai.")
    print(f"Hasil tersimpan di: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
