/**
 * CDDA Multi-File Sprite Loader
 */
export async function initSpriteSystem(jsonPaths) {
    // 1. Force input into an array (even if it's just one string)
    const paths = Array.isArray(jsonPaths) ? jsonPaths : [jsonPaths];

    console.log(`[SpriteEngine] Loading ${paths.length} definition files...`);

    // 2. Fetch ALL JSON files in parallel
    const configs = await Promise.all(paths.map(async (path) => {
        try {
            const res = await fetch(path);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e) {
            console.error(`[SpriteEngine] Failed to load ${path}:`, e);
            return null;
        }
    }));

    // Filter out failed loads
    const validConfigs = configs.filter(c => c !== null);
    if (validConfigs.length === 0) {
        console.error("[SpriteEngine] No valid JSON configs found. Aborting.");
        return null;
    }

    // 3. Establish defaults from the first valid config
    const globalTileInfo = validConfigs[0].tile_info[0];
    const pixelscale = globalTileInfo.pixelscale || 1;
    const globalW = globalTileInfo.width;
    const globalH = globalTileInfo.height;

    // 4. Merge all "tiles-new" chunks into one big list
    let allChunks = [];
    validConfigs.forEach(cfg => {
        if (cfg["tiles-new"]) {
            allChunks = allChunks.concat(cfg["tiles-new"]);
        }
    });

    console.log(`[SpriteEngine] Processing ${allChunks.length} sprite chunks...`);

    // 5. Preload Images & Build ID Map
    const imageMap = new Map();
    const idMap = new Map();

    await Promise.all(allChunks.map(async (chunk) => {
        // Only load the image if we haven't seen it yet
        if (!imageMap.has(chunk.file)) {
            const img = new Image();
            img.src = chunk.file; // Assumes PNG is in same folder
            await new Promise(r => {
                img.onload = r;
                img.onerror = () => {
                    console.warn(`[SpriteEngine] Missing image: ${chunk.file}`);
                    r(); // Resolve anyway so we don't block everything
                };
            });
            imageMap.set(chunk.file, img);
        }

        const img = imageMap.get(chunk.file);
        if (!img || !img.width) return; // Skip if image failed

        const sW = chunk.sprite_width || globalW;
        const sH = chunk.sprite_height || globalH;
        const nx = Math.floor(img.width / sW);

        // Map IDs
        if (chunk.tiles) {
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
        }
    }));

    function formatLayer(layer, chunk, nx, w, h) {
        if (layer === undefined || layer === null) return null;
        const spriteId = (typeof layer === 'object') ? layer.sprite : layer;
        
        // Handle "random" sprites (lists of weights) - just pick first for now
        if (Array.isArray(spriteId)) return null; 

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

    console.log(`[SpriteEngine] Ready! Mapped ${idMap.size} IDs.`);

    // 6. Return the Draw Function
    return function draw(canvasId, spriteId) {
        const data = idMap.get(spriteId);
        
        // Error handling if ID is missing (draws a red placeholder)
        if (!data) {
            console.warn(`[SpriteEngine] ID not found: ${spriteId}`);
            return false; 
        }

        const canvas = document.getElementById(canvasId);
        if (!canvas) return false;
        
        const ctx = canvas.getContext('2d');
        canvas.width = data.w * pixelscale;
        canvas.height = data.h * pixelscale;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        [data.bg, data.fg].forEach(layer => {
            if (!layer) return;
            const img = imageMap.get(layer.file);
            if (!img) return;

            ctx.drawImage(
                img,
                layer.tx * layer.width, layer.ty * layer.height,
                layer.width, layer.height,
                layer.offx * pixelscale, layer.offy * pixelscale,
                layer.width * pixelscale, layer.height * pixelscale
            );
        });
        return true;
    };
            }
