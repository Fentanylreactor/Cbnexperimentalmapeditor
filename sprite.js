/**
 * CDDA Dynamic Sprite Loader
 */
export async function initSpriteSystem(jsonPath) {
    const response = await fetch(jsonPath);
    const config = await response.json();
    
    const globalTileInfo = config.tile_info[0];
    const pixelscale = globalTileInfo.pixelscale || 1;
    
    const imageMap = new Map();
    const idMap = new Map();

    // 1. Preload images and process chunks
    const chunks = config["tiles-new"];
    await Promise.all(chunks.map(async (chunk) => {
        const img = new Image();
        img.src = chunk.file;
        await new Promise(r => img.onload = r);
        imageMap.set(chunk.file, img);

        // Calculate dynamic dimensions for THIS chunk
        const sW = chunk.sprite_width || globalTileInfo.width;
        const sH = chunk.sprite_height || globalTileInfo.height;
        const nx = Math.floor(img.width / sW);

        // 2. Map IDs to their specific chunk coordinates
        chunk.tiles.forEach(tileEntry => {
            const ids = Array.isArray(tileEntry.id) ? tileEntry.id : [tileEntry.id];
            ids.forEach(id => {
                idMap.set(id, {
                    fg: formatLayer(tileEntry.fg, chunk, nx, sW, sH),
                    bg: formatLayer(tileEntry.bg, chunk, nx, sW, sH),
                    w: sW,
                    h: sH
                });
            });
        });
    }));

    function formatLayer(layer, chunk, nx, w, h) {
        if (layer === undefined || layer === null) return null;
        const spriteId = (typeof layer === 'object') ? layer.sprite : layer;
        return {
            file: chunk.file,
            tx: spriteId % nx,
            ty: Math.floor(spriteId / nx),
            width: w,
            height: h,
            offx: chunk.sprite_offset_x || 0,
            offy: chunk.sprite_offset_y || 0
        };
    }

    // 3. The returned Draw function handles dynamic sizing
    return function draw(canvasId, spriteId) {
        const data = idMap.get(spriteId);
        if (!data) return console.warn("Sprite not found:", spriteId);

        const canvas = document.getElementById(canvasId);
        const ctx = canvas.getContext('2d');

        // Resize canvas to match this specific sprite's dimensions
        canvas.width = data.w * pixelscale;
        canvas.height = data.h * pixelscale;
        ctx.imageSmoothingEnabled = false;

        [data.bg, data.fg].forEach(layer => {
            if (!layer) return;
            const img = imageMap.get(layer.file);
            
            ctx.drawImage(
                img,
                layer.tx * layer.width, layer.ty * layer.height, // Source X, Y
                layer.width, layer.height,                      // Source W, H
                layer.offx * pixelscale, layer.offy * pixelscale, // Dest Offset
                layer.width * pixelscale, layer.height * pixelscale // Dest Size
            );
        });
    };
}
