class GrappleSystem {
    constructor(scene) {
        this.scene = scene;
        this.hasSnapped = false; 
    }

    startZip(pick) {
        const s = this.scene;
        if (!s.player.body) return;
        if (pick.state === 'pre_zipping' || pick.state === 'pre_returning' || pick.state === 'returning') return;

        let ropeKey = (pick === s.pick1) ? 'ropeLength1' : 'ropeLength2';
        let aStart  = (pick === s.pick1) ? s.activeStart1 : s.activeStart2;
        let aEnd    = (pick === s.pick1) ? s.activeEnd1   : s.activeEnd2;
        s[ropeKey] = s.ropePhysics.calculateActualRopeLength(pick, aStart, aEnd);

        if (pick === s.pick1 && s.retractTimer1) { s.retractTimer1.remove(); s.retractTimer1 = null; }
        if (pick === s.pick2 && s.retractTimer2) { s.retractTimer2.remove(); s.retractTimer2 = null; }

        // 立即开始飞 — 无延迟 (之前 180ms pre_zipping 造成"点了不马上飞"的延迟感)
        pick.state = 'attached';
        s.isGrappling = true;
        s.activeGrapplePick = pick;
        this.hasSnapped = false;
        // 开启幽灵态，防止途中撞墙卡死
        s.player.body.setAllowGravity(false);
        s.player.body.checkCollision.none = true;
    }

    stopGrapple() {
        const s = this.scene;
        s.isGrappling = false;
        s.isHanging   = false; 
        this.hasSnapped = false; 

        if (s.player.body) {
            // 恢复物理重力与实体碰撞
            s.player.body.setAllowGravity(true);
            s.player.body.checkCollision.none = false; 
        }
        // 落地后自动收回铁镐
        if (s.activeGrapplePick) s.recallSystem.startRecall(s.activeGrapplePick);
        s.activeGrapplePick = null;
    }

    /**
     * 【恢复原版并完美优化】：放射性安全点搜寻算法 (Spiral Radar)
     * 严格执行你要求的判定：寻找 X>=32, Y>=64 的安全空间
     */
    findSafeSpot(targetX, targetY) {
        const s = this.scene;
        
        // 无论角色当前处于什么姿态，都强制使用站立时的 32x64 完整体型进行预判！
        let bw = 32;
        let bh = 64;
        let currentXOffset = 48;   // (用户) X 居中统一 — 转身零位移
        let currentYOffset = 45; // 站立时的 Y 轴偏移量

        let isSafe = (cx, cy) => {
            let bodyLeft = cx - 64 + currentXOffset;
            let bodyTop  = cy - 64 + currentYOffset;
            
            // 【神级修复】：外围包裹 1 像素的安全缓冲垫！
            let testRect = new Phaser.Geom.Rectangle(
                bodyLeft - 1, 
                bodyTop - 1, 
                bw + 2, 
                bh + 2
            );

            for (let w of s.wallRects) {
                if (Phaser.Geom.Intersects.RectangleToRectangle(testRect, w)) {
                    return false;
                }
            }
            return true;
        };

        // 脚下是否有地板支撑 (body 底部下方 6px 内有墙) — 防止落到悬崖旁边的空中掉下去
        let hasSupport = (cx, cy) => {
            let bodyLeft = cx - 64 + currentXOffset;
            let bodyTop  = cy - 64 + currentYOffset;
            let feetRect = new Phaser.Geom.Rectangle(bodyLeft + 4, bodyTop + bh + 1, bw - 8, 6);
            for (let w of s.wallRects) {
                if (Phaser.Geom.Intersects.RectangleToRectangle(feetRect, w)) return true;
            }
            return false;
        };

        // 1. 目标点本身就开阔且脚下有地板 → 完美, 直接返回
        if (isSafe(targetX, targetY) && hasSupport(targetX, targetY)) {
            return { x: targetX, y: targetY };
        }

        // 螺旋搜索参数
        let maxRadius = 200;
        let stepRadius = 2;
        let angleStep = Math.PI / 8;
        const SUPPORT_RADIUS = 24;  // 只在这个半径内才"优先有支撑的落点"

        // 记录最近的纯空位 (无论有无支撑) 作为兜底
        let firstSafe = null;
        if (isSafe(targetX, targetY)) firstSafe = { x: targetX, y: targetY };

        for (let r = stepRadius; r <= maxRadius; r += stepRadius) {
            for (let angle = 0; angle < Math.PI * 2; angle += angleStep) {
                let testX = targetX + Math.cos(angle) * r;
                let testY = targetY + Math.sin(angle) * r;
                if (isSafe(testX, testY)) {
                    // 近距离内优先有地板支撑的点 (踩稳在悬崖/平台边缘)
                    if (r <= SUPPORT_RADIUS && hasSupport(testX, testY)) {
                        return { x: testX, y: testY };
                    }
                    if (!firstSafe) firstSafe = { x: testX, y: testY };
                }
            }
            // 超出支撑优先半径 → 直接用最近的空位 (不强行送到远处的地板, 比如一格方块顶上)
            if (r > SUPPORT_RADIUS && firstSafe) return firstSafe;
        }

        // 兜底
        return firstSafe || { x: targetX, y: targetY };
    }

    update() {
        const s = this.scene;
        if (s.isHanging && s._hangHurtCheck) s._hangHurtCheck();   // (用户) 挂墙幽灵态 overlap 不触发 → 手动判怪伤害 (扣血但不击退/不脱钩)
        if (!s.isGrappling || !s.activeGrapplePick) return;

        let pPick = s.activeGrapplePick;
        let nodes = (pPick === s.pick1) ? s.ropeNodes1 : s.ropeNodes2;

        // 寻找离铁镐最近的绳索节点作为飞行引导
        let targetNode = pPick;
        let myDistToGoal = Phaser.Math.Distance.Between(s.player.x, s.player.y, pPick.x, pPick.y);
        for (let i = 0; i < 15; i++) {
            let nodeDistToGoal = Phaser.Math.Distance.Between(nodes[i].x, nodes[i].y, pPick.x, pPick.y);
            let distToMe = Phaser.Math.Distance.Between(s.player.x, s.player.y, nodes[i].x, nodes[i].y);
            if (distToMe > 40 && nodeDistToGoal < myDistToGoal) {
                targetNode = nodes[i];
                break;
            }
        }

        // 到达阈值判定 (距离铁镐 65 像素内)
        if (myDistToGoal <= 65) {
            
            // ==========================================
            // 【精准落地与防穿模执行】
            // ==========================================
            if (!this.hasSnapped) {
                this.hasSnapped = true;
                
                // 探测出绝对满足 32x64 大小的安全坐标
                let safePos = this.findSafeSpot(pPick.x, pPick.y);
                
                // 【核心解法】：同时更新图像位置，并使用 reset 强制同步物理盒子！
                // 这彻底解决了之前“图片传出去了，物理碰撞盒还留在墙里”的致命脱节Bug
                s.player.setPosition(safePos.x, safePos.y);
                s.player.body.reset(safePos.x, safePos.y); 

                // (用户) 飞到稿子的"那一刻"一律切蹲下 — 不再要求事先蹲下, 飞过去必定蹲着挂墙.
                //   只在首次 snap 强制一次; 之后玩家按 S 取消蹲下仍可照常掉落 (见下方 else 分支).
                s.isCrouching = true;
            }

            // 落地后的状态判定
            if (s.isCrouching) {
                s.isHanging = true;
                s.player.body.checkCollision.none = true; 
                s.player.body.setVelocity(0, 0);
            } else {
                // 挂墙后按 S 取消蹲下 → 收回稿子掉下 (绳子立即消失, 不残留/不播回收动画)
                s.isHanging = false;
                s.isGrappling = false;
                this.hasSnapped = false;
                if (s.player.body) {
                    s.player.body.setAllowGravity(true);
                    s.player.body.checkCollision.none = false;
                }
                const gp = s.activeGrapplePick;
                s.activeGrapplePick = null;
                if (gp && s.recallSystem) s.recallSystem.doCollect(gp);  // 直接入背包 → pick idle → 绳子不再绘制
            }

        } else {
            // 还在飞行途中，赋予 1440 的高速动能
            s.isHanging = false;
            let angle = Phaser.Math.Angle.Between(s.player.x, s.player.y, targetNode.x, targetNode.y);
            s.player.body.setVelocity(Math.cos(angle) * 1440, Math.sin(angle) * 1440);
        }
    }
}