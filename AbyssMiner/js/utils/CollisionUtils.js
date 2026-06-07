class CollisionUtils {
    /**
     * 扫掠检测: 线段 (sx,sy)→(ex,ey) 是否穿过任何墙 (防高速穿墙 tunneling)
     * 墙体外扩 expand (近似稿子半身), slab 法求最早入墙点
     * 返回 { hit, x, y, rect } — (x,y) 是停在墙前的位置
     */
    static sweptSegmentVsWalls(sx, sy, ex, ey, wallRects, expand) {
        expand = expand || 0;
        const dx = ex - sx, dy = ey - sy;
        if (dx === 0 && dy === 0) return { hit: false };
        let bestT = Infinity, bestRect = null;
        for (let k = 0; k < wallRects.length; k++) {
            const w = wallRects[k];
            const left = w.left - expand, right = w.right + expand;
            const top = w.top - expand, bottom = w.bottom + expand;
            let tmin = 0, tmax = 1;
            // x 轴 slab
            if (Math.abs(dx) < 1e-8) {
                if (sx < left || sx > right) continue;   // 平行且在墙外 → 不撞
            } else {
                let t1 = (left - sx) / dx, t2 = (right - sx) / dx;
                if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
                if (t1 > tmin) tmin = t1;
                if (t2 < tmax) tmax = t2;
                if (tmin > tmax) continue;
            }
            // y 轴 slab
            if (Math.abs(dy) < 1e-8) {
                if (sy < top || sy > bottom) continue;
            } else {
                let t1 = (top - sy) / dy, t2 = (bottom - sy) / dy;
                if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
                if (t1 > tmin) tmin = t1;
                if (t2 < tmax) tmax = t2;
                if (tmin > tmax) continue;
            }
            // tmin = 入墙参数 (起点已在墙内时 tmin=0). 取最早命中的墙
            if (tmin >= 0 && tmin <= 1 && tmin < bestT) { bestT = tmin; bestRect = w; }
        }
        if (bestRect) {
            const t = Math.max(0, bestT - 0.001);  // 稍微往回, 不正好嵌表面
            return { hit: true, x: sx + dx * t, y: sy + dy * t, rect: bestRect };
        }
        return { hit: false };
    }

    /**
     * 解析铁镐与墙体的碰撞（radius = 8）
     */
    static resolvePickWallCollision(pick, wallRects) {
        let radius = 8;
        for (let w of wallRects) {
            if (pick.x >= w.left && pick.x <= w.right && pick.y >= w.top && pick.y <= w.bottom) {
                if (pick.body.preX <= w.left) pick.x = w.left - radius;
                else if (pick.body.preX >= w.right) pick.x = w.right + radius;
                else if (pick.body.preY <= w.top) pick.y = w.top - radius;
                else if (pick.body.preY >= w.bottom) pick.y = w.bottom + radius;
                else {
                    let dl = pick.x - w.left; let dr = w.right - pick.x;
                    let dt = pick.y - w.top;  let db = w.bottom - pick.y;
                    let min = Math.min(dl, dr, dt, db);
                    if (min === dl) pick.x = w.left - radius;
                    else if (min === dr) pick.x = w.right + radius;
                    else if (min === dt) pick.y = w.top - radius;
                    else if (min === db) pick.y = w.bottom + radius;
                }
            } else {
                let cx = Phaser.Math.Clamp(pick.x, w.left, w.right);
                let cy = Phaser.Math.Clamp(pick.y, w.top, w.bottom);
                let dx = pick.x - cx;
                let dy = pick.y - cy;
                let distSq = dx * dx + dy * dy;
                if (distSq < radius * radius) {
                    let dist = Math.sqrt(distSq);
                    if (dist === 0) dist = 0.001;
                    let overlap = radius - dist;
                    pick.x += (dx / dist) * overlap;
                    pick.y += (dy / dist) * overlap;
                }
            }
        }
    }

    /**
     * 解析 Verlet 节点与墙体的碰撞
     */
    static resolveVerletWallCollision(node, wallRects) {
        // 【核心修改】：把 24 改为 3。彻底消除空气墙，让绳子真实地贴紧墙壁边缘！
        let radius = 3; 
        
        for (let w of wallRects) {
            if (node.x >= w.left && node.x <= w.right && node.y >= w.top && node.y <= w.bottom) {
                if (node.ox <= w.left) node.x = w.left - radius;
                else if (node.ox >= w.right) node.x = w.right + radius;
                else if (node.oy <= w.top) node.y = w.top - radius;
                else if (node.oy >= w.bottom) node.y = w.bottom + radius;
                else {
                    let dl = node.x - w.left; let dr = w.right - node.x;
                    let dt = node.y - w.top;  let db = w.bottom - node.y;
                    let min = Math.min(dl, dr, dt, db);
                    if (min === dl) node.x = w.left - radius;
                    else if (min === dr) node.x = w.right + radius;
                    else if (min === dt) node.y = w.top - radius;
                    else if (min === db) node.y = w.bottom + radius;
                }
            } else {
                let cx = Phaser.Math.Clamp(node.x, w.left, w.right);
                let cy = Phaser.Math.Clamp(node.y, w.top, w.bottom);
                let dx = node.x - cx;
                let dy = node.y - cy;
                let distSq = dx * dx + dy * dy;
                if (distSq < radius * radius) {
                    let dist = Math.sqrt(distSq);
                    if (dist === 0) dist = 0.001;
                    let overlap = radius - dist;
                    node.x += (dx / dist) * overlap;
                    node.y += (dy / dist) * overlap;
                }
            }
        }
    }
}