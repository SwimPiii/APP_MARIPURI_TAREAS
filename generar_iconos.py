# Script para generar iconos de la aplicación
# Ejecutar: python generar_iconos.py

from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size, filename):
    """Crear un icono con el emoji de mariposa"""
    
    # Crear imagen con gradiente
    img = Image.new('RGB', (size, size), color='white')
    draw = ImageDraw.Draw(img)
    
    # Crear gradiente de fondo (aproximación simple)
    for y in range(size):
        ratio = y / size
        r = int(102 + (118 - 102) * ratio)
        g = int(126 + (75 - 126) * ratio)
        b = int(234 + (162 - 234) * ratio)
        draw.rectangle([(0, y), (size, y+1)], fill=(r, g, b))
    
    # Intentar añadir el emoji de mariposa
    try:
        # En Windows, la fuente Segoe UI Emoji contiene emojis
        font_size = int(size * 0.6)
        
        # Intentar diferentes fuentes
        font_paths = [
            "C:\\Windows\\Fonts\\seguiemj.ttf",  # Windows
            "/System/Library/Fonts/Apple Color Emoji.ttc",  # macOS
            "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf"  # Linux
        ]
        
        font = None
        for font_path in font_paths:
            if os.path.exists(font_path):
                try:
                    font = ImageFont.truetype(font_path, font_size)
                    break
                except:
                    continue
        
        if font:
            # Dibujar el emoji
            text = "🦋"
            bbox = draw.textbbox((0, 0), text, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            
            x = (size - text_width) // 2
            y = (size - text_height) // 2
            
            draw.text((x, y), text, font=font, fill='white')
        else:
            # Si no hay fuente emoji disponible, dibujar un círculo con 'M'
            draw.ellipse([size//4, size//4, 3*size//4, 3*size//4], 
                        fill='#d946ef', outline='white', width=5)
            
            # Fuente normal para la M
            try:
                font = ImageFont.truetype("arial.ttf", int(size * 0.4))
            except:
                font = ImageFont.load_default()
            
            text = "M"
            bbox = draw.textbbox((0, 0), text, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            
            x = (size - text_width) // 2
            y = (size - text_height) // 2
            
            draw.text((x, y), text, font=font, fill='white')
    
    except Exception as e:
        print(f"No se pudo añadir texto: {e}")
        # Solo guardar el gradiente
        pass
    
    # Guardar imagen
    img.save(filename, 'PNG')
    print(f"✓ Creado: {filename}")

if __name__ == "__main__":
    print("🦋 Generando iconos para Maripuri's App...")
    print()
    
    # Verificar si PIL está instalado
    try:
        from PIL import Image
    except ImportError:
        print("❌ ERROR: Pillow no está instalado")
        print()
        print("Para instalar:")
        print("  pip install Pillow")
        print()
        input("Presiona Enter para salir...")
        exit(1)
    
    # Crear iconos
    create_icon(192, 'icon-192.png')
    create_icon(512, 'icon-512.png')
    
    # Crear favicon
    create_icon(32, 'favicon.ico')
    
    print()
    print("✅ ¡Iconos generados exitosamente!")
    print()
    print("Archivos creados:")
    print("  - icon-192.png")
    print("  - icon-512.png")
    print("  - favicon.ico")
    print()
    input("Presiona Enter para salir...")
