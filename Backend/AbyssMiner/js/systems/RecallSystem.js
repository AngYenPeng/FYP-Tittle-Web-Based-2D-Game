class RecallSystem {
    constructor(scene) {
        this.scene = scene;
    }

    startRecall(pick, instant = false) {
        const s = this.scene;
        if (pick.state === 'returning' || pick.state === 'idle') return;

        // 如果正在 grapple/挂在 这把 稿子上 → 先解除, 否则收回时玩家会跟着稿子飞出去
        // (用户修复) 只有收回"正抓着/正挂着的那把"才解除悬挂; 收另一只手的稿子不影响当前蹲挂
        // (旧逻辑: isHanging 为真时收任何一把都解除 → 挂着收另一把, 人莫名掉下去)
        if ((s.isGrappling || s.isHanging) && (s.activeGrapplePick === pick || !s.activeGrapplePick)) {
            s.isGrappling = false;
            s.isHanging = false;
            s.activeGrapplePick = null;
            if (s.grappleSystem) s.grappleSystem.hasSnapped = false;
            if (s.player.body) {
                s.player.body.setAllowGravity(true);      // 恢复重力 (从挂墙状态掉下来)
                s.player.body.checkCollision.none = false; // 恢复碰撞
            }
        }

        let ropeKey = (pick === s.pick1) ? 'ropeLength1' : 'ropeLength2';
        let aStart  = (pick === s.pick1) ? s.activeStart1 : s.activeStart2;
        let aEnd    = (pick === s.pick1) ? s.activeEnd1   : s.activeEnd2;

        if (instant) {
            pick.state = 'returning';
            pick.body.setVelocity(0, 0);
            pick.body.setAllowGravity(false);
            pick.body.checkCollision.none = true;
            s[ropeKey] = s.ropePhysics.calculateActualRopeLength(pick, aStart, aEnd);
            return;
        }

        if (pick.state === 'pre_returning' || pick.state === 'pre_zipping') return;

        pick.state = 'pre_returning';
        pick.body.setVelocity(0, 0);
        pick.body.setAllowGravity(false);
        s[ropeKey] = s.ropePhysics.calculateActualRopeLength(pick, aStart, aEnd);

        s.time.delayedCall(180, () => {
            if (pick.state === 'pre_returning') {
                pick.state = 'returning';
                pick.body.checkCollision.none = true;
            }
        });
    }

    doCollect(pick) {
        const s = this.scene;
        // 彻底清空并重置绳索状态
        if (pick === s.pick1) { s.inv.left  = true; s.ropeLength1 = 0; s.activeStart1 = 0; s.activeEnd1 = 14; }
        if (pick === s.pick2) { s.inv.right = true; s.ropeLength2 = 0; s.activeStart2 = 0; s.activeEnd2 = 14; }
        pick.body.checkCollision.none = false;
        pick.backToInventory();
    }

    update() {
        const s = this.scene;

        [s.pick1, s.pick2].forEach((p, idx) => {
            if (p.state === 'returning') {
                // 稿子直线匀速朝玩家移动 (position-based)
                // 绳子节点不在这里碰 — 交给 RopePhysics else 分支做直线插值 (玩家↔稿子), 始终同步
                let returnSpeed = 1560;
                let step = returnSpeed * (s.game.loop.delta / 1000);
                let dx = s.player.x - p.x;
                let dy = s.player.y - p.y;
                let dist = Math.sqrt(dx * dx + dy * dy);

                if (dist <= step || dist <= 65) {
                    // 到玩家手上 → 收回
                    this.doCollect(p);
                    return;
                }
                // 直接移动 (无 velocity lerp → 不抽搐), 同步物理盒
                let nx = p.x + (dx / dist) * step;
                let ny = p.y + (dy / dist) * step;
                if (p.body) p.body.reset(nx, ny);
                else { p.x = nx; p.y = ny; }
            }
            // dropped 状态: 玩家走近也能捡回
            else if (p.state === 'dropped' &&
                     Phaser.Math.Distance.Between(s.player.x, s.player.y, p.x, p.y) <= 65) {
                this.doCollect(p);
            }
        });
    }
}