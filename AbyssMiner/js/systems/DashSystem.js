class DashSystem {
    constructor(scene) {
        this.scene = scene;
    }

    /**
     * 执行冲刺：计算冷却、锁定重力、延迟恢复
     * @param {'left'|'right'} direction
     */
    executeDash(direction) {
        const s = this.scene;
        if (!s.player.body) return;
        if (s.dashCooldown > 0) return;

        let now = s.time.now;
        let interval = (now - s.lastDashTime) / 1000;
        s.dashCooldown = (0.3 + Math.max(0, 0.9 - interval)) * 1000;

        s.isDashing = true;
        if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(s, 'Dash');   // (用户) 冲刺音效, 一次一播
        s.lastDashTime = now;

        // 【贴墙判定】检测面向方向 1px 内是否紧贴墙：贴墙→速度0（原地冲刺无敌+CD），不贴墙→正常冲刺
        // 高度内缩 4px 避免误判到脚下地板/头顶天花板
        let stuck = false;
        if (s.wallRects) {
            let bx = s.player.body.x;
            let by = s.player.body.y;
            let bw = s.player.body.width;
            let bh = s.player.body.height;
            let testRect = (direction === 'right')
                ? new Phaser.Geom.Rectangle(bx + bw, by + 4, 1, bh - 8)
                : new Phaser.Geom.Rectangle(bx - 1, by + 4, 1, bh - 8);
            for (let w of s.wallRects) {
                if (Phaser.Geom.Intersects.RectangleToRectangle(testRect, w)) { stuck = true; break; }
            }
        }

        let dashVx = stuck ? 0 : (direction === 'left' ? -s.dashSpeed : s.dashSpeed);
        s.player.setVelocityX(dashVx);
        s.player.body.setAllowGravity(false);
        s.player.setVelocityY(0);

        // (用户修复) 冲刺 CCD 保险 — 下落沿阶梯缝嵌角后, 冲刺高速会把嵌入态从墙里弹出去 (Arcade 分离歧义).
        //   每个物理步结束后校验: body 嵌进墙 → 沿冲刺反方向 2px 回推到贴墙 + 提前终止冲刺. 物理上不可能再穿.
        const world = s.physics && s.physics.world;
        if (this._dashGuard && world) { world.off('worldstep', this._dashGuard); this._dashGuard = null; }
        if (world && s.wallRects && s.wallRects.length) {
            const dashDir = (direction === 'left') ? -1 : 1;
            this._dashGuard = () => {
                const b = s.player && s.player.body;
                if (!b || !s.isDashing) { if (this._dashGuard) { world.off('worldstep', this._dashGuard); this._dashGuard = null; } return; }
                const hit = () => {
                    const r = new Phaser.Geom.Rectangle(b.position.x + 1, b.position.y + 1, b.width - 2, b.height - 2);
                    for (let w of s.wallRects) { if (Phaser.Geom.Intersects.RectangleToRectangle(r, w)) return true; }
                    return false;
                };
                if (!hit()) return;
                // 嵌墙: 回推 (最多 48px), 玩家精灵与 body 同步平移 (origin 偏移期间线性关系不变)
                let pushed = 0;
                while (pushed < 48 && hit()) {
                    b.position.x -= dashDir * 2;
                    s.player.x -= dashDir * 2;
                    pushed += 2;
                }
                b.updateCenter();
                b.stop();
                s.isDashing = false;
                if (!s.isGrappling && !s.isHanging) b.setAllowGravity(true);
                world.off('worldstep', this._dashGuard); this._dashGuard = null;
            };
            world.on('worldstep', this._dashGuard);
        }

        // 播 dash 动画 — sprite 居中显示在 body 上，hitbox 不变
        const dashAnim = s.anims.exists('dash') ? s.anims.get('dash') : null;
        const hasValidDash = dashAnim && dashAnim.frames && dashAnim.frames.length > 0
                             && s.textures.exists('Miner_dash');
        if (hasValidDash) {
            try {
                // 保存原 offset，切到 dash 后保持 hitbox 世界位置不动
                this._origOffsetX = s.player.body.offset.x;
                this._origOffsetY = s.player.body.offset.y;
                // (用户) 按帧尺寸差动态补偿 — 旧版硬编码 256×256 的 +64, 换 160×80 新图后帧高 128→80,
                //   displayOrigin 64→40, body 整箱下沉 24px (x 也偏 16). 公式:
                //   body 顶左 = 精灵中心 − 帧/2 + offset → 帧变了 offset 须 + (新帧−旧帧)/2, 左右朝向通用, 以后换图也不会坏
                const prevF = s.player.frame;
                const prevW = prevF ? prevF.realWidth : 128, prevH = prevF ? prevF.realHeight : 128;
                s.player.play('dash');
                const dashF = s.player.frame;
                const dW = dashF ? dashF.realWidth : prevW, dH = dashF ? dashF.realHeight : prevH;
                let offX = this._origOffsetX + (dW - prevW) / 2;
                const offY = this._origOffsetY + (dH - prevH) / 2;
                // (用户) 视觉对位: 左冲 origin 0.1 / 右冲 0.9 (画面挪 ±64), origin 改动全程配 offset 反向补偿 → body 不动.
                //   依据: 贴墙左冲时 stuck 使 dashVx=0 被误判成右冲走了 0.1, 而那次画面"刚刚好" → 左冲正解=0.1, 镜像得右冲=0.9;
                //   并与"空地右冲偏右4格/左冲偏左4格"反推一致 (0.1+0.8=0.9 / 0.9-0.8=0.1).
                //   方向用 direction 变量 (冲刺意图), 不用 dashVx — stuck 时 dashVx=0 会误判.
                const ART_SHIFT = 64;   // 不准的话只调这一个数 (正值加大 = 画面更远离冲刺方向)
                const dashDir = (direction === 'left') ? -1 : 1;
                const oxDash = 0.5 + (ART_SHIFT / dW) * dashDir;   // 右冲 0.9=画面左移64, 左冲 0.1=右移64
                s.player.setOrigin(oxDash, 0.5);
                offX += (oxDash - 0.5) * dW;   // 右冲 -64 / 左冲 +64, 与 origin 位移抵消 → body 不动
                s.player.body.setOffset(offX, offY);
            } catch(e) { console.warn('[Dash] play failed', e); }
        }

        // dashDuration 后恢复
        s.time.delayedCall(s.dashDuration, () => {
            if (this._dashGuard && s.physics && s.physics.world) { s.physics.world.off('worldstep', this._dashGuard); this._dashGuard = null; }
            if (s.player && s.player.body) {
                s.isDashing = false;
                if (!s.isGrappling && !s.isHanging) s.player.body.setAllowGravity(true);
                if (hasValidDash) {
                    // 切回 idle
                    if (s.anims.exists('idle')) {
                        try { s.player.play('idle'); } catch(e) {}
                    }
                    // 恢复原 offset + 视觉 origin
                    s.player.setOrigin(0.5, 0.5);   // (用户) 还原 dash 期间的画面前移
                    if (this._origOffsetX != null) {
                        s.player.body.setOffset(this._origOffsetX, this._origOffsetY);
                    }
                }
            }
        });
    }
}