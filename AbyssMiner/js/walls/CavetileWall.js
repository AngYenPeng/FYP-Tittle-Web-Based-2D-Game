/**
 * CavetileWall — 物理墙体 + 多层皮肤渲染
 *
 * 皮肤逻辑（按距空气最近曼哈顿距离 dist 分层）：
 *
 *   dist = 1：第一层（紧贴空气）
 *     根据哪些方向接触空气选 TRBL / TRB / TR / TB / T，按方向旋转
 *
 *   dist = 2：第二层
 *     Cavetile_wall_2L
 *
 *   dist >= 3：第三层及更深
 *     按优先级生成（高优先级覆盖低优先级）：
 *
 *     优先级 1（最高）：5LC1/2/3 — 深层水晶（dist >= 5 才有）
 *       dist=5: 每张 4% (共 12%)
 *       dist=6: 每张 5% (共 15%)
 *       dist>=7: 每张 6% (共 18%)（封顶）
 *       4 个随机旋转 (0/90/180/270)
 *
 *     优先级 2：3LC1/2/3 — 浅层水晶（dist >= 3）
 *       仅在该格未被 5LC 占用时生成
 *       dist=3: 每张 5% (共 15%)
 *       dist=4: 每张 6% (共 18%)
 *       dist>=5: 每张 3% (共 9%)
 *       4 个随机旋转
 *
 *     优先级 3（保底）：3L1/2/3 — 普通深层墙
 *       未被上面两种占用时必出
 *       三选一随机，不旋转
 */
class CavetileWall extends Wall {
    constructor(scene, x, y, w, h) {
        super(scene, x, y, w, h, 0x555555);
        this.isPlatform = false;
        if (scene.gridSystem) {
            scene.gridSystem.markRect(x, y, w, h, GridSystem.WALL);
        }
    }

    /** 渲染整个 scene 的 cavetile 皮肤
     * @param {Phaser.Scene} scene
     * @param {object} [area]  {col1, row1, col2, row2} — 只重渲指定范围
     */
    static renderSkins(scene, area) {
        const grid = scene.gridSystem;
        if (!grid) return;
        const cs = grid.cellSize;
        const half = cs / 2;

        // 1. 隐藏原始灰色矩形（全模式都跑 — 新建的 CavetileWall 灰底要藏起来）
        scene.walls.getChildren().forEach(w => {
            if (w.fillColor === 0x555555) w.setVisible(false);
        });

        // 2. area 模式：先删除指定范围内所有旧皮肤
        if (area) {
            const minX = (grid.originX || 0) + area.col1 * cs;
            const minY = (grid.originY || 0) + area.row1 * cs;
            const maxX = (grid.originX || 0) + (area.col2 + 1) * cs;
            const maxY = (grid.originY || 0) + (area.row2 + 1) * cs;
            scene.children.list.slice().forEach(c => {
                if (!c || c.depth !== -5) return;
                if (!c.texture || !c.texture.key || !c.texture.key.startsWith('Cavetile_')) return;
                if (c.x >= minX && c.x < maxX && c.y >= minY && c.y < maxY) {
                    c.destroy();
                }
            });
        }

        const isAir = (col, row) => {
            // grid 外视为 wall（不是 air）— 防止地图外当 air 渲染错误的边缘皮肤
            if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return false;
            const t = grid.grid[row][col];
            return t === GridSystem.AIR || t === GridSystem.DOOR || t === GridSystem.PLATFORM;
        };
        const isWall = (col, row) => {
            // grid 外返回 false（让 BFS 不越界访问 distMap）
            if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return false;
            return grid.grid[row][col] === GridSystem.WALL;
        };
        // 给皮肤选择用 — grid 外视为 wall（让边缘 cavetile 不显示对外露出的皮肤）
        const isWallForSkin = (col, row) => {
            if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return true;
            return grid.grid[row][col] === GridSystem.WALL;
        };

        // 2. 计算每格距空气最近曼哈顿距离 (BFS)
        const distMap = [];
        for (let r = 0; r < grid.rows; r++) {
            const row = []; for (let c = 0; c < grid.cols; c++) row.push(99);
            distMap.push(row);
        }
        const queue = [];
        for (let r = 0; r < grid.rows; r++) {
            for (let c = 0; c < grid.cols; c++) {
                if (!isWall(c, r)) continue;
                if (isAir(c-1, r) || isAir(c+1, r) || isAir(c, r-1) || isAir(c, r+1)) {
                    distMap[r][c] = 1;
                    queue.push([c, r]);
                }
            }
        }
        while (queue.length > 0) {
            const [cc, cr] = queue.shift();
            const d = distMap[cr][cc];
            const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
            for (const [dx, dy] of DIRS) {
                const nx = cc + dx, ny = cr + dy;
                if (!isWall(nx, ny)) continue;
                if (distMap[ny][nx] > d + 1) {
                    distMap[ny][nx] = d + 1;
                    queue.push([nx, ny]);
                }
            }
        }

        // 3. 按 dist 选贴图
        const rowStart = area ? Math.max(0, area.row1) : 0;
        const rowEnd = area ? Math.min(grid.rows - 1, area.row2) : grid.rows - 1;
        const colStart = area ? Math.max(0, area.col1) : 0;
        const colEnd = area ? Math.min(grid.cols - 1, area.col2) : grid.cols - 1;
        for (let row = rowStart; row <= rowEnd; row++) {
            for (let col = colStart; col <= colEnd; col++) {
                if (!isWall(col, row)) continue;
                const dist = distMap[row][col];
                const worldX = (grid.originX || 0) + col * cs + half;
                const worldY = (grid.originY || 0) + row * cs + half;

                let tex = null;
                let ang = 0;

                if (dist === 1) {
                    // 第一层：按邻居方向选贴图
                    const t = isAir(col, row - 1);
                    const r = isAir(col + 1, row);
                    const b = isAir(col, row + 1);
                    const l = isAir(col - 1, row);
                    const airCount = (t?1:0) + (r?1:0) + (b?1:0) + (l?1:0);

                    if (airCount === 4) {
                        tex = 'Cavetile_wall_TRBL';
                    } else if (airCount === 3) {
                        tex = 'Cavetile_wall_TRB';
                        if (!l) ang = 0;
                        else if (!t) ang = 90;
                        else if (!r) ang = 180;
                        else if (!b) ang = 270;
                    } else if (airCount === 2) {
                        if (t && b) { tex = 'Cavetile_wall_TB'; ang = 0; }
                        else if (r && l) { tex = 'Cavetile_wall_TB'; ang = 90; }
                        else if (t && r) { tex = 'Cavetile_wall_TR'; ang = 0; }
                        else if (r && b) { tex = 'Cavetile_wall_TR'; ang = 90; }
                        else if (b && l) { tex = 'Cavetile_wall_TR'; ang = 180; }
                        else if (l && t) { tex = 'Cavetile_wall_TR'; ang = 270; }
                    } else if (airCount === 1) {
                        tex = 'Cavetile_wall_T';
                        if (t) ang = 0;
                        else if (r) ang = 90;
                        else if (b) ang = 180;
                        else if (l) ang = 270;
                    }
                } else if (dist === 2) {
                    tex = 'Cavetile_wall_2L';
                } else {
                    // dist >= 3：按优先级
                    const result = CavetileWall._pickDeepLayerTexture(dist);
                    tex = result.tex;
                    ang = result.ang;
                }

                if (!tex || !scene.textures.exists(tex)) {
                    // 回退到 3L1（保底必有）或 2L 或 _M
                    tex = ['Cavetile_wall_3L1', 'Cavetile_wall_2L', 'Cavetile_wall_M']
                        .find(k => scene.textures.exists(k));
                    if (!tex) continue;
                    ang = 0;
                }

                const img = scene.add.image(worldX, worldY, tex);
                img.setAngle(ang);
                img.setDepth(-5);
                img.active = false;

                if (scene.uiCam) scene.uiCam.ignore(img);
            }
        }

        // 关掉墙体内部接缝碰撞 (防止玩家贴墙下落卡在瓦片接缝上) — 全量渲染时每场景跑一次
        if (!area && !scene._edgesCulled) {
            CavetileWall.cullInternalEdges(scene);
            scene._edgesCulled = true;
        }
    }

    /** 关掉墙体之间的内部接缝碰撞 — 玩家贴墙下落不会卡在两块墙的接缝("看不见的凸起物")上 */
    static cullInternalEdges(scene) {
        if (!scene.walls || !scene.walls.getChildren) return;
        const cs = (scene.gridSystem && scene.gridSystem.cellSize) || 32;
        const tiles = scene.walls.getChildren().filter(w => w && w.body && !w.isPlatform && !w._isPlatform);
        const cellOf = (w) => [Math.round((w.x - cs / 2) / cs), Math.round((w.y - cs / 2) / cs)];  // 墙中心反推格子 (中心 = c*cs + cs/2)
        const cells = new Set();
        tiles.forEach(w => { const [c, r] = cellOf(w); cells.add(c + ',' + r); });
        const has = (c, r) => cells.has(c + ',' + r);
        tiles.forEach(w => {
            const [c, r] = cellOf(w);
            // 有墙邻居的那条边 = 内部接缝 → 关掉; 朝外(对着空气)的边保留
            w.body.checkCollision.up    = !has(c, r - 1);
            w.body.checkCollision.down  = !has(c, r + 1);
            w.body.checkCollision.left  = !has(c - 1, r);
            w.body.checkCollision.right = !has(c + 1, r);
        });
    }

    /** dist >= 3 的格子按优先级选贴图 */
    static _pickDeepLayerTexture(dist) {
        // 优先级 1：5LC（dist >= 5）
        if (dist >= 5) {
            // 每张概率：dist=5 → 4%, dist=6 → 5%, dist>=7 → 6%
            const eachP = dist === 5 ? 0.04 : (dist === 6 ? 0.05 : 0.06);
            const totalP = eachP * 3;  // 3 张图共
            const r = Math.random();
            if (r < totalP) {
                // 命中 5LC 之一
                const idx = Math.floor(Math.random() * 3) + 1;  // 1, 2, 3
                const ang = [0, 90, 180, 270][Math.floor(Math.random() * 4)];
                return { tex: 'Cavetile_wall_5LC' + idx, ang };
            }
        }

        // 优先级 2：3LC（dist >= 3）
        // 每张概率：dist=3 → 5%, dist=4 → 6%, dist>=5 → 3%
        const eachP3LC = dist === 3 ? 0.05 : (dist === 4 ? 0.06 : 0.03);
        const totalP3LC = eachP3LC * 3;
        const r2 = Math.random();
        if (r2 < totalP3LC) {
            const idx = Math.floor(Math.random() * 3) + 1;
            const ang = [0, 90, 180, 270][Math.floor(Math.random() * 4)];
            return { tex: 'Cavetile_wall_3LC' + idx, ang };
        }

        // 优先级 3（保底）：3L1/2/3 普通深层墙
        const idx = Math.floor(Math.random() * 3) + 1;
        return { tex: 'Cavetile_wall_3L' + idx, ang: 0 };
    }
}