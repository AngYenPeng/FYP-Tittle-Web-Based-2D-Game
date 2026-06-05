/**
 * GridSystem — 32×32 格子类型表
 *
 * 维护整个世界的格子类型映射：
 *   AIR      = 空气
 *   WALL     = 实心墙（玩家阻挡 + fog 阻挡）
 *   PLATFORM = 单向平台（fog 阻挡，玩家阻挡视方向）
 *   DOOR     = 门（fog 阻挡 + 玩家阻挡，open 后变 AIR）
 *
 * 用途：
 *   - FogSystem 用此查格子类型决定 BFS 是否传播
 *   - 后续放墙壁皮肤可按格子类型贴对应贴图
 *
 * 规则：
 *   - 默认所有格子 AIR
 *   - Wall / PlatformBlock / Door 创建时调 markRect() 标记自己覆盖的所有格子
 *   - Door.open() 调 unmarkRect() 把格子改回 AIR
 */
class GridSystem {
    static AIR = 0;
    static WALL = 1;
    static PLATFORM = 2;
    static DOOR = 3;
    static BLOCK = 4;       // 可破坏方块（水晶矿等），fog 阻挡 + 物理阻挡，但不被 Cavetile 皮肤当墙画

    constructor(scene, cellSize, worldW, worldH, originX = 0, originY = 0) {
        this.scene = scene;
        this.cellSize = cellSize;
        this.cols = Math.ceil(worldW / cellSize);
        this.rows = Math.ceil(worldH / cellSize);
        // 世界坐标偏移：grid (0,0) 对应世界 (originX, originY)
        this.originX = originX;
        this.originY = originY;

        this.grid = [];
        for (let y = 0; y < this.rows; y++) {
            const row = [];
            for (let x = 0; x < this.cols; x++) row.push(GridSystem.AIR);
            this.grid.push(row);
        }
    }

    /** 标记一个矩形区域（中心 cx, cy, 宽 w, 高 h）的所有覆盖格子为 type */
    markRect(cx, cy, w, h, type) {
        const left  = cx - w / 2;
        const top   = cy - h / 2;
        const right = cx + w / 2;
        const bot   = cy + h / 2;
        const cs = this.cellSize;
        // (用户) 性能: 直接换算受影响的格子范围 — 旧实现每次全网格双循环.
        // SZ4 旧网格 9 万格 × boss战中每个水晶/墙的生灭都调一次 = 运行时尖峰主因.
        // 语义不变: 格子中心 (originX + (x+0.5)*cs) 落在矩形内才标记.
        let c1 = Math.ceil((left - this.originX) / cs - 0.5);
        let c2 = Math.floor((right - this.originX) / cs - 0.5);
        let r1 = Math.ceil((top - this.originY) / cs - 0.5);
        let r2 = Math.floor((bot - this.originY) / cs - 0.5);
        if (c1 < 0) c1 = 0;
        if (r1 < 0) r1 = 0;
        if (c2 >= this.cols) c2 = this.cols - 1;
        if (r2 >= this.rows) r2 = this.rows - 1;
        for (let y = r1; y <= r2; y++) {
            for (let x = c1; x <= c2; x++) {
                this.grid[y][x] = type;
            }
        }
    }

    /** 把一个矩形区域的格子改为 AIR（用于 Door.open() 等） */
    unmarkRect(cx, cy, w, h) {
        this.markRect(cx, cy, w, h, GridSystem.AIR);
    }

    /** 查格子类型 */
    getType(col, row) {
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return GridSystem.WALL;  // 边界外视为墙
        return this.grid[row][col];
    }

    /** 是否阻挡（WALL / PLATFORM / DOOR 都阻挡）— 用于 fog */
    isBlocker(col, row) {
        const t = this.getType(col, row);
        return t !== GridSystem.AIR;
    }
}