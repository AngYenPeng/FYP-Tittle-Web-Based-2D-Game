/**
 * FogSystem — 视野系统（圆形渐变光照 + 墙后规则）
 *
 * 状态：
 *   0 = 黑雾（未踏足，alpha 1）
 *   1 = 已访问连通区
 *   2 = 灰雾（曾去过，alpha 0.55）
 *
 * 规则：
 *   - 主 BFS 玩家空气连通区扩散
 *   - 遇到墙：解锁这 1 格墙
 *     - 墙后是空气 → 不扩散（原本黑雾规则）
 *     - 墙后是实心 → 沿同方向递推扩散到曼哈顿 ≤ 3 的实心墙（穿透看墙）
 *   - 已解锁格子按欧氏距离渐变 alpha：
 *       距 ≤ 300 (R_INNER)：0
 *       距 ≤ 600 (R_MID)  ：插值 0 → 0.20
 *       距 ≤ 900 (R_OUTER)：插值 0.20 → 0.40
 *       距 > 900：0.40
 *   - 灰雾 alpha 0.55，黑雾 alpha 1.0
 *
 * 性能优化：
 *   - 玩家跨格才 BFS
 *   - 渲染时分两组：
 *     a) 整个世界一次性画 alpha 1 黑底（fillRect 整片）
 *     b) visibleCells 上"覆盖"画带 alpha 黑色 → 但 alpha 1 + alpha < 1 黑色叠加 = 仍 alpha 1 黑（无效）
 *
 * 实际可行方法：
 *   - 不画黑底
 *   - 每帧 clear gfx
 *   - 遍历 visibleCells 画 state=1/2 的 alpha
 *   - 遍历"未解锁"的 visibleCells 边界外格子画 alpha 1（这些是 BFS 未到达的）
 *   - 但"未解锁的格子"数量大 (1500+)，仍要遍历
 *
 * 简化最实用方法：
 *   - 用 graphics.fillStyle 一次性画大矩形覆盖整个世界 (alpha 1) 当黑雾
 *   - 然后画亮色（alpha=0/反 alpha）抠出可见格子 — graphics 不支持反向
 *
 * → 最终方案：还是逐格画 (2360 个 fillRect)，但用以下优化：
 *   1. 玩家位置每帧变 → 只对 visibleCells 重算 alpha
 *   2. 黑雾格 alpha 永远 1，可以"按行合并" (一行连续黑雾用 1 个 fillRect)
 */
class FogSystem {
    constructor(scene, cellSize, worldW, worldH, originX = 0, originY = 0) {
        this.scene = scene;
        this.cellSize = cellSize;
        this.originX = originX;   // (用户) 支持负坐标地图: 雾网格原点(像素), 与 gridSystem 对齐
        this.originY = originY;
        this.cols = Math.ceil(worldW / cellSize);
        this.rows = Math.ceil(worldH / cellSize);

        this.state = [];
        this.staticWallAlpha = [];   // 墙后深度对应的固定 alpha（不随玩家变化）
        for (let y = 0; y < this.rows; y++) {
            const row = [], srow = [];
            for (let x = 0; x < this.cols; x++) { row.push(0); srow.push(-1); }
            this.state.push(row);
            this.staticWallAlpha.push(srow);
        }

        this.visibleCells = new Set();
        this.permanentlyVisible = new Set();  // 一旦解锁过永远在内（即使 state=2 灰雾也不撤销）

        this.gfx = scene.add.graphics();
        this.gfx.setDepth(810);
        this.gfx.setPosition(this.originX, this.originY);   // fillRect 用网格本地坐标, 整体平移到原点

        // (用户) 性能重构: 渐变不再逐格重画 — 改用径向渐变贴图做反向遮罩 (BitmapMask invertAlpha),
        // 每帧只移动遮罩精灵; 渐变层本身只画"当前连通区=统一最暗 0.40", 由遮罩在玩家周围抠亮.
        this.gradGfx = scene.add.graphics();
        this.gradGfx.setDepth(809);
        this.gradGfx.setPosition(this.originX, this.originY);
        this._maskImg = null;
        this._maskOk = false;
        try {
            const webgl = scene.game && scene.game.renderer && typeof Phaser !== 'undefined' && scene.game.renderer.type === Phaser.WEBGL;
            if (webgl) {
                const key = '__fogRadialMask';
                if (!scene.textures.exists(key)) {
                    const size = 512, half = 256;
                    const canvasTex = scene.textures.createCanvas(key, size, size);
                    const c2d = canvasTex.getContext();
                    const grad = c2d.createRadialGradient(half, half, 0, half, half, half);
                    grad.addColorStop(0, 'rgba(255,255,255,1)');       // 玩家中心: 全亮
                    grad.addColorStop(0.275, 'rgba(255,255,255,1)');   // R_INNER(110)/R_OUTER(400)
                    grad.addColorStop(0.6, 'rgba(255,255,255,0.5)');   // R_MID(240) → A_MID/A_OUTER = 0.20/0.40
                    grad.addColorStop(1, 'rgba(255,255,255,0)');       // R_OUTER(400): 最暗
                    c2d.fillStyle = grad;
                    c2d.fillRect(0, 0, size, size);
                    canvasTex.refresh();
                }
                this._maskImg = scene.make.image({ key: key, add: false });   // 不进显示列表, 只当遮罩源
                this._maskImg.setDisplaySize(800, 800);   // 贴图半径 256px ↔ 世界 R_OUTER 400px
                const bm = new Phaser.Display.Masks.BitmapMask(scene, this._maskImg);
                bm.invertAlpha = true;   // 遮罩亮处(玩家附近) → 渐变层隐藏 = 亮
                this.gradGfx.setMask(bm);
                this._maskOk = true;
            } else {
                this.gradGfx.setVisible(false);   // Canvas 渲染器不支持 BitmapMask → 退化为只有黑雾/灰雾
            }
        } catch (e) { try { this.gradGfx.setVisible(false); } catch (e2) {} }

        this.lastPlayerCol = -1;
        this.lastPlayerRow = -1;

        // (用户) 设置里的光影开关 (localStorage, 默认开) — 构造时自己读, 所有场景零改动生效
        this.enabled = true;
        try {
            const sv = JSON.parse(localStorage.getItem('abyssMinerSettings') || '{}');
            if (sv.fog === false) { this.enabled = false; if (this.gfx) this.gfx.setVisible(false); if (this.gradGfx) this.gradGfx.setVisible(false); }
        } catch (e) {}

        // (用户) 按屏幕尺度重调: 1600x900 + zoom 2 → 可视半径仅 ±400x±225px.
        // 旧半径 300/600/900 整圈都在屏幕外 → 光影完全看不见 ("根本没有"的原因)
        this.R_INNER = 110;    // 玩家身边亮圈
        this.R_MID   = 240;
        this.R_OUTER = 400;    // 屏幕横向边缘即达最暗
        this.A_INNER = 0;
        this.A_MID   = 0.20;   // (用户) 还原最初设计值 — 当时说"不够黑"其实是雾根本没显示
        this.A_OUTER = 0.40;

        // 墙后实心深度 alpha 叠加值（在玩家距离 alpha 基础上加）
        // 深度 1: +0.05, 2: +0.10, 3: +0.15, 4: +0.20, 5: +0.30, 6: +0.40
        // 深度 7+ → 黑雾（不解锁）
        // 前 3 格用曼哈顿距离扩散，后 3 格沿同方向递推
        this.WALL_DEPTH_DELTAS = [0.05, 0.10, 0.15, 0.20, 0.30, 0.40];
    }

    _isBlocker(col, row) {
        // 优先用 GridSystem（精准）
        if (this.scene.gridSystem) {
            return this.scene.gridSystem.isBlocker(col, row);
        }
        // 兼容回退：用 wallRects 几何检测
        const cx = col * this.cellSize + this.cellSize / 2;
        const cy = row * this.cellSize + this.cellSize / 2;
        if (!this.scene.wallRects) return false;
        for (const r of this.scene.wallRects) {
            if (cx >= r.x && cx <= r.x + r.width &&
                cy >= r.y && cy <= r.y + r.height) return true;
        }
        return false;
    }

    _updateConnectedRegion(startCol, startRow) {
        // state==1 → 2
        for (const key of this.visibleCells) {
            const [xs, ys] = key.split(',');
            const x = +xs, y = +ys;
            if (this.state[y][x] === 1) this.state[y][x] = 2;
        }
        if (startCol < 0 || startCol >= this.cols || startRow < 0 || startRow >= this.rows) return;

        const queue = [[startCol, startRow]];
        const visited = new Set();
        visited.add(startCol + ',' + startRow);
        this.state[startRow][startCol] = 1;
        this.visibleCells.add(startCol + ',' + startRow);
        this.permanentlyVisible.add(startCol + ',' + startRow);
        const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        const wallBoundary = [];
        while (queue.length > 0) {
            const [cx, cy] = queue.shift();
            for (const [dx, dy] of DIRS) {
                const nx = cx + dx, ny = cy + dy;
                if (nx < 0 || nx >= this.cols || ny < 0 || ny >= this.rows) continue;
                const key = nx + ',' + ny;
                if (visited.has(key)) continue;
                visited.add(key);
                if (this._isBlocker(nx, ny)) {
                    this.state[ny][nx] = 1;
                    this.visibleCells.add(key);
                    this.permanentlyVisible.add(key);
                    wallBoundary.push([nx, ny, dx, dy]);
                    continue;
                }
                this.state[ny][nx] = 1;
                this.visibleCells.add(key);
                this.permanentlyVisible.add(key);
                queue.push([nx, ny]);
            }
        }

        this._lastRegionCount = visited.size;   // (用户) 连通区大小 — 用于"区域是否变化"的脏检测

        // 墙后规则：
        //   墙后是空气 → 不扩散
        //   墙后是实心 → 内部 BFS 在墙内扩散 6 格深度，遇空气停
        //   每格保存"曼哈顿深度"，用于渲染时叠加 alpha
        const MAX_DEPTH = this.WALL_DEPTH_DELTAS.length;  // 6 格
        // 收集所有"墙后空气"格子（用于后续撤销周围墙）
        const behindAirCells = [];
        for (const [bx, by, dx, dy] of wallBoundary) {
            const behindX = bx + dx, behindY = by + dy;
            if (behindX < 0 || behindX >= this.cols || behindY < 0 || behindY >= this.rows) continue;
            if (!this._isBlocker(behindX, behindY)) {
                behindAirCells.push([behindX, behindY]);
                continue;
            }
            // 墙后实心 → BFS 在墙内扩散，每格按曼哈顿距离记录深度
            // 起点是 (bx, by) 深度 0（墙边界，不叠加 alpha）
            // 邻居深度 1, 2, 3... 直到 MAX_DEPTH
            const innerQueue = [[bx, by, 0]];
            const innerVisited = new Set();
            innerVisited.add(bx + ',' + by);
            while (innerQueue.length > 0) {
                const [ix, iy, d] = innerQueue.shift();
                if (d >= MAX_DEPTH) continue;
                for (const [ddx, ddy] of DIRS) {
                    const nx = ix + ddx, ny = iy + ddy;
                    if (nx < 0 || nx >= this.cols || ny < 0 || ny >= this.rows) continue;
                    const ikey = nx + ',' + ny;
                    if (innerVisited.has(ikey)) continue;
                    innerVisited.add(ikey);
                    if (!this._isBlocker(nx, ny)) continue;  // 遇到空气停
                    this.state[ny][nx] = 1;
                    this.visibleCells.add(ikey);
                    this.permanentlyVisible.add(ikey);
                    // 深度 d+1 的 alpha 叠加值（已设过的格子取最小深度 = 最亮）
                    const newDelta = this.WALL_DEPTH_DELTAS[d];  // d 起点 0，邻居深度 1 → index 0
                    if (this.staticWallAlpha[ny][nx] < 0 || this.staticWallAlpha[ny][nx] > newDelta) {
                        this.staticWallAlpha[ny][nx] = newDelta;
                    }
                    innerQueue.push([nx, ny, d + 1]);
                }
            }
        }

        // 墙后空气优先级规则：
        // "墙后空气" 2 格曼哈顿范围内的墙，如果不是玩家空气直接撞到的（不在 wallBoundary 里），
        // → 撤销解锁（恢复 state=0 黑雾）
        //
        // wallBoundary 里的墙是"玩家空气直接撞到"的 → 优先级高，不会被撤销
        const wallBoundarySet = new Set();
        for (const [bx, by] of wallBoundary) {
            wallBoundarySet.add(bx + ',' + by);
        }
        const cancelCandidates = new Set();
        for (const [ax, ay] of behindAirCells) {
            // 收集 (ax, ay) 周围曼哈顿 ≤ 2 内的所有墙格
            for (let ddy = -2; ddy <= 2; ddy++) {
                for (let ddx = -2; ddx <= 2; ddx++) {
                    if (Math.abs(ddx) + Math.abs(ddy) > 2) continue;
                    const wx = ax + ddx, wy = ay + ddy;
                    if (wx < 0 || wx >= this.cols || wy < 0 || wy >= this.rows) continue;
                    if (!this._isBlocker(wx, wy)) continue;
                    // 是阻挡 + 不是玩家直接撞到的墙 → 候选撤销
                    if (!wallBoundarySet.has(wx + ',' + wy)) {
                        cancelCandidates.add(wx + ',' + wy);
                    }
                }
            }
        }
        // 撤销这些墙的解锁（但不撤销 permanentlyVisible 里的格子 — 玩家曾经直接撞到过）
        for (const key of cancelCandidates) {
            if (this.permanentlyVisible.has(key)) continue;  // 永久可见不撤销
            const [xs, ys] = key.split(',');
            const x = +xs, y = +ys;
            if (this.state[y][x] === 1) {
                this.state[y][x] = 0;
                this.staticWallAlpha[y][x] = -1;
                this.visibleCells.delete(key);
            }
        }
    }

    setEnabled(on) {
        this.enabled = !!on;
        if (this.gfx) this.gfx.setVisible(this.enabled);
        if (this.gradGfx) this.gradGfx.setVisible(this.enabled && this._maskOk);
        if (this.enabled) { this.lastPlayerCol = -99999; this._everRendered = false; }   // 重新打开 → 强制重算+重画
    }

    update(playerX, playerY) {
        if (this.enabled === false) return;
        if (this._maskImg) this._maskImg.setPosition(playerX, playerY);   // 每帧只有这一个精灵位移
        const col = Math.floor((playerX - this.originX) / this.cellSize);
        const row = Math.floor((playerY - this.originY) / this.cellSize);
        if (col !== this.lastPlayerCol || row !== this.lastPlayerRow) {
            this.lastPlayerCol = col;
            this.lastPlayerRow = row;
            const prevVis = this.visibleCells.size;
            const prevRegion = this._lastRegionCount;
            this._updateConnectedRegion(col, row);
            // (用户) 只有连通区真的变了 (探索到新格子 / 区域分合) 才重画静态层;
            // 在已探索区域里走动 = 零图形重画, 只有 BFS (纯数组运算)
            if (this.visibleCells.size !== prevVis || this._lastRegionCount !== prevRegion || !this._everRendered) {
                this._everRendered = true;
                this._renderStatic();
            }
        }
    }

    _alphaForDistance(d) {
        if (d <= this.R_INNER) return this.A_INNER;
        if (d <= this.R_MID) {
            const t = (d - this.R_INNER) / (this.R_MID - this.R_INNER);
            return this.A_INNER + (this.A_MID - this.A_INNER) * t;
        }
        if (d <= this.R_OUTER) {
            const t = (d - this.R_MID) / (this.R_OUTER - this.R_MID);
            return this.A_MID + (this.A_OUTER - this.A_MID) * t;
        }
        return this.A_OUTER;
    }

    _renderStatic() {
        const cs = this.cellSize;
        const runFill = (gfx, wantState, alpha) => {
            gfx.fillStyle(0x000000, alpha);
            for (let y = 0; y < this.rows; y++) {
                let runStart = -1;
                for (let x = 0; x < this.cols; x++) {
                    if (this.state[y][x] === wantState) {
                        if (runStart === -1) runStart = x;
                    } else if (runStart !== -1) {
                        gfx.fillRect(runStart * cs, y * cs, (x - runStart) * cs, cs);
                        runStart = -1;
                    }
                }
                if (runStart !== -1) gfx.fillRect(runStart * cs, y * cs, (this.cols - runStart) * cs, cs);
            }
        };

        // ── 硬雾层 (与玩家位置无关): 黑雾 1.0 + 灰雾 0.55 + 墙后深度阴影 ──
        this.gfx.clear();
        runFill(this.gfx, 0, 1.0);
        runFill(this.gfx, 2, 0.55);
        for (const key of this.visibleCells) {
            const [xs, ys] = key.split(',');
            const x = +xs, y = +ys;
            if (this.state[y][x] !== 1) continue;
            const delta = this.staticWallAlpha[y][x];
            if (delta > 0) {
                this.gfx.fillStyle(0x000000, Math.min(1, delta));
                this.gfx.fillRect(x * cs, y * cs, cs, cs);
            }
        }

        // ── 渐变层: 当前连通区统一画最暗 A_OUTER, 玩家周围由径向遮罩抠亮 ──
        if (this.gradGfx && this._maskOk) {
            this.gradGfx.clear();
            runFill(this.gradGfx, 1, this.A_OUTER);
        }
    }
}