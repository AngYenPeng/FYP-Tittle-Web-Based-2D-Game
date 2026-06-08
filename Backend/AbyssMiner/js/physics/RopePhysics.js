class RopePhysics {
    constructor(scene) {
        this.scene = scene;
    }

    /**
     * 计算绳索的实际物理长度（沿节点路径累加）
     */
    calculateActualRopeLength(pick, aStart, aEnd) {
        const s = this.scene;
        let nodes = (pick === s.pick1) ? s.ropeNodes1 : s.ropeNodes2;
        let total = 0;
        let prevX = s.player.x, prevY = s.player.y;
        if (aStart <= aEnd) {
            for (let i = aStart; i <= aEnd; i++) {
                total += Phaser.Math.Distance.Between(prevX, prevY, nodes[i].x, nodes[i].y);
                prevX = nodes[i].x; prevY = nodes[i].y;
            }
        }
        total += Phaser.Math.Distance.Between(prevX, prevY, pick.x, pick.y);
        return total;
    }

    /**
     * Verlet 约束：将两点间距离维持在 targetDist（只推开，不拉近）
     */
    constrainVerlet(p1, p2, targetDist, isP1Fixed, isP2Fixed) {
        let dx = p2.x - p1.x;
        let dy = p2.y - p1.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return;

        let diff = dist - targetDist;
        if (diff < 0) return; // 只处理超长，不压缩

        let percent = (diff / dist) * 1.0;
        let offsetX = dx * percent * 0.5;
        let offsetY = dy * percent * 0.5;

        if (!isP1Fixed && !isP2Fixed) {
            p1.x += offsetX; p1.y += offsetY;
            p2.x -= offsetX; p2.y -= offsetY;
        } else if (isP1Fixed && !isP2Fixed) {
            p2.x -= offsetX * 2; p2.y -= offsetY * 2;
        } else if (!isP1Fixed && isP2Fixed) {
            p1.x += offsetX * 2; p1.y += offsetY * 2;
        }
    }

    /**
     * 每帧处理指定铁镐的 Verlet 绳索：模拟、约束、碰撞、绘制
     * @returns {number} maxD - 最大节点段距离（用于张力判断）
     */
    processVerletRope(pick, id) {
        const s = this.scene;

        // ═══════════════════════════════════════════════════════════
        // 扫掠防穿墙: 自己每帧采样 body.center (物理步进后的真实位置, 无歧义),
        // 上一帧 center → 这一帧 center = 本帧真实移动线段。expand=6 堵对角格缝
        // ═══════════════════════════════════════════════════════════
        const moving = (pick.state === 'flying_max' || pick.state === 'flying_gravity' || pick.state === 'dropping');
        if (moving && pick.body && s.wallRects && s.wallRects.length) {
            const cx = pick.body.center.x;
            const cy = pick.body.center.y;
            if (pick._lastCX !== undefined) {
                // (用户) 空气墙 (_pickExtraWalls, 静态 body 自带 left/right/top/bottom) 一并扫掠
                let wl = s.wallRects;
                if (s._pickExtraWalls && s._pickExtraWalls.length) {
                    wl = wl.concat(s._pickExtraWalls.filter(w => w && w.body).map(w => w.body));
                }
                const hit = CollisionUtils.sweptSegmentVsWalls(pick._lastCX, pick._lastCY, cx, cy, wl, 6);
                if (hit.hit) {
                    pick.body.reset(hit.x, hit.y);
                    pick.x = hit.x; pick.y = hit.y;
                    if (typeof s.handlePickCollide === 'function') {
                        s.handlePickCollide(pick, (pick === s.pick1) ? 1 : 2);
                    }
                }
            }
            // 记录这一帧 center (修正后) 供下一帧扫掠
            pick._lastCX = pick.body.center.x;
            pick._lastCY = pick.body.center.y;
        } else {
            pick._lastCX = undefined;  // 非飞行态清空, 下次发射重新起算
        }

        let nodes = (id === 0) ? s.ropeNodes1 : s.ropeNodes2;
        if (pick.state === 'idle') return 0;

        let aStart = (id === 0) ? s.activeStart1 : s.activeStart2;
        let aEnd   = (id === 0) ? s.activeEnd1   : s.activeEnd2;
        let ropeKey = (id === 0) ? 'ropeLength1' : 'ropeLength2';

        if (pick.state === 'flying_max' || pick.state === 'flying_gravity') {
            s[ropeKey] = Phaser.Math.Distance.Between(s.player.x, s.player.y, pick.x, pick.y);
        }

        let maxLen = s[ropeKey];
        if (!maxLen || maxLen === 0) maxLen = 10;

        let numActiveSegments = (aStart <= aEnd) ? (aEnd - aStart + 2) : 1;
        let restLen = maxLen / numActiveSegments;

        let isPreState  = (pick.state === 'pre_zipping' || pick.state === 'pre_returning');
        let isZipping   = (s.isGrappling && s.activeGrapplePick === pick);
        let isReturning = (pick.state === 'returning');
        // returning 和 zipping 都不进 Verlet 模拟 — 改用下面 else 的直线插值(玩家↔稿子),
        // 这样绳子始终是玩家到稿子的直线, 飞行/收回时紧绷跟随, 不滞后不停半空不抽搐
        let isSimulating = (
            pick.state === 'dropping' ||
            pick.state === 'pre_returning' ||
            (pick.state === 'attached' && !isZipping)
        );

        if (isSimulating) {
            // ═══════════════════════════════════════════════════════════════
            // 性能优化: 绳子只跟"附近"的墙做碰撞, 不是全图几千个
            // (大地图如 SZ3 有数千 wallRects, 30 迭代×35 节点×全部墙 = 每帧数百万次 → 严重 lag)
            // 包围盒 = 玩家 ↔ 稿子 ↔ 所有节点当前位置 + margin, 每帧每绳只算一次
            // ═══════════════════════════════════════════════════════════════
            let nearbyRects = s.wallRects;
            if (s.wallRects && s.wallRects.length > 0) {
                const M = 64;  // margin: 容纳绳子下垂 + 节点移动
                let bMinX = Math.min(s.player.x, pick.x);
                let bMaxX = Math.max(s.player.x, pick.x);
                let bMinY = Math.min(s.player.y, pick.y);
                let bMaxY = Math.max(s.player.y, pick.y);
                for (let i = aStart; i <= aEnd; i++) {
                    const nn = nodes[i];
                    if (nn.x < bMinX) bMinX = nn.x; else if (nn.x > bMaxX) bMaxX = nn.x;
                    if (nn.y < bMinY) bMinY = nn.y; else if (nn.y > bMaxY) bMaxY = nn.y;
                }
                bMinX -= M; bMaxX += M; bMinY -= M; bMaxY += M;
                nearbyRects = [];
                const all = s.wallRects;
                for (let k = 0; k < all.length; k++) {
                    const w = all[k];
                    if (w.right >= bMinX && w.left <= bMaxX && w.bottom >= bMinY && w.top <= bMaxY) {
                        nearbyRects.push(w);
                    }
                }
            }

            // --- Verlet 积分 ---
            for (let i = aStart; i <= aEnd; i++) {
                let n = nodes[i];
                let vx = (n.x - n.ox) * 0.95;
                let vy = (n.y - n.oy) * 0.95;
                n.ox = n.x; n.oy = n.y;
                n.x += vx;
                if (!isPreState && !isReturning && !isZipping && pick.state !== 'attached') {
                    n.y += vy + 0.8;
                } else {
                    n.y += vy;
                }
                CollisionUtils.resolveVerletWallCollision(n, nearbyRects);
            }

            // --- 约束迭代（30次）---
            for (let iter = 0; iter < 30; iter++) {
                if (aStart <= aEnd) {
                    this.constrainVerlet(s.player, nodes[aStart], restLen, true, false);
                    for (let i = aStart; i < aEnd; i++) {
                        this.constrainVerlet(nodes[i], nodes[i + 1], restLen, false, false);
                    }
                    this.constrainVerlet(nodes[aEnd], pick, restLen, false, true);

                    // 中间点碰撞修正（玩家 → 首节点）
                    let midStart = {
                        x:  (s.player.x + nodes[aStart].x) / 2,
                        y:  (s.player.y + nodes[aStart].y) / 2,
                        ox: (s.player.body ? s.player.body.preX : s.player.x + nodes[aStart].ox) / 2,
                        oy: (s.player.body ? s.player.body.preY : s.player.y + nodes[aStart].oy) / 2
                    };
                    let omsx = midStart.x, omsy = midStart.y;
                    CollisionUtils.resolveVerletWallCollision(midStart, nearbyRects);
                    nodes[aStart].x += (midStart.x - omsx);
                    nodes[aStart].y += (midStart.y - omsy);

                    // 节点对之间的中间点碰撞修正
                    for (let i = aStart; i < aEnd; i++) {
                        let mid = {
                            x:  (nodes[i].x + nodes[i + 1].x) / 2,
                            y:  (nodes[i].y + nodes[i + 1].y) / 2,
                            ox: (nodes[i].ox + nodes[i + 1].ox) / 2,
                            oy: (nodes[i].oy + nodes[i + 1].oy) / 2
                        };
                        let omx = mid.x, omy = mid.y;
                        CollisionUtils.resolveVerletWallCollision(mid, nearbyRects);
                        let px = mid.x - omx;
                        let py = mid.y - omy;
                        nodes[i].x += px;     nodes[i].y += py;
                        nodes[i + 1].x += px; nodes[i + 1].y += py;
                    }

                    // 中间点碰撞修正（末节点 → 铁镐）
                    let midEnd = {
                        x:  (nodes[aEnd].x + pick.x) / 2,
                        y:  (nodes[aEnd].y + pick.y) / 2,
                        ox: (nodes[aEnd].ox + (pick.body ? pick.body.preX : pick.x)) / 2,
                        oy: (nodes[aEnd].oy + (pick.body ? pick.body.preY : pick.y)) / 2
                    };
                    let omex = midEnd.x, omey = midEnd.y;
                    CollisionUtils.resolveVerletWallCollision(midEnd, nearbyRects);
                    nodes[aEnd].x += (midEnd.x - omex);
                    nodes[aEnd].y += (midEnd.y - omey);

                } else {
                    // 节点数为 0，直接玩家 ↔ 铁镐约束
                    let isPickFixed = (pick.state === 'attached' || isReturning || isPreState || isZipping);
                    this.constrainVerlet(s.player, pick, restLen, true, isPickFixed);
                }

                for (let i = aStart; i <= aEnd; i++) {
                    CollisionUtils.resolveVerletWallCollision(nodes[i], nearbyRects);
                }
            }
        } else {
            // 非模拟状态：线性插值初始化节点
            nodes.forEach((n, i) => {
                let ratio = (i + 1) / 16;
                n.x = Phaser.Math.Interpolation.Linear([s.player.x, pick.x], ratio);
                n.y = Phaser.Math.Interpolation.Linear([s.player.y, pick.y], ratio);
                n.ox = n.x; n.oy = n.y;
            });
        }

        // --- 计算最大节点段距离（用于张力颜色和自动收回判断）---
        let maxD = 0;
        let prevX = s.player.x, prevY = s.player.y;
        if (aStart <= aEnd) {
            for (let i = aStart; i <= aEnd; i++) {
                let d = Phaser.Math.Distance.Between(prevX, prevY, nodes[i].x, nodes[i].y);
                if (d > maxD) maxD = d;
                prevX = nodes[i].x; prevY = nodes[i].y;
            }
        }
        let dLast = Phaser.Math.Distance.Between(prevX, prevY, pick.x, pick.y);
        if (dLast > maxD) maxD = dLast;

        let ropeColor = maxD > (s.WARNING_DISTANCE / 16) ? 0xff0000 : 0xD2691E;   // (用户) 平时巧克力色, 拉紧仍红色警戒

        // --- 过滤视觉上重叠的节点 ---
        let validNodes = [];
        for (let i = 0; i < 15; i++) {
            let skip = false;
            if (isZipping   && Phaser.Math.Distance.Between(s.player.x, s.player.y, nodes[i].x, nodes[i].y) < 60) skip = true;
            if (isReturning && Phaser.Math.Distance.Between(pick.x, pick.y, nodes[i].x, nodes[i].y) < 60) skip = true;
            if (!skip) validNodes.push(nodes[i]);
        }

        // --- 绘制绳索 ---
        s.ropeGraphics.lineStyle(2, ropeColor, 0.8);
        s.ropeGraphics.beginPath();
        s.ropeGraphics.moveTo(s.player.x, s.player.y);
        validNodes.forEach(n => s.ropeGraphics.lineTo(n.x, n.y));
        s.ropeGraphics.lineTo(pick.x, pick.y);
        s.ropeGraphics.strokePath();

        // (用户) 绳子上的白色节点不再显示 (只画绳线)

        return maxD;
    }
}