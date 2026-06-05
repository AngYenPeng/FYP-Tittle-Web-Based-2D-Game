class ThrowSystem {
    constructor(scene) {
        this.scene = scene;
    }

    /**
     * 每帧更新准星视觉反馈（已移除变大变红的蓄力动画，仅保留手上有无稿的明暗提示）
     */
    updateUI() {
        const s = this.scene;
        let side = s.player.pState.activeHand;

        // (用户) 移除左右手图标提示 — 改为解锁双手后 (pickaxeUpgraded) 按当前手切换鼠标光标贴图
        s.leftHandIndicator.setVisible(false);
        s.rightHandIndicator.setVisible(false);

        // 如果手里有镐，准星高亮；如果没有，准星变暗
        let alpha = s.inv[side] ? 1 : 0.3;
        if (s._pickaxeUpgraded && s.textures.exists('MouseCursor_Left') && s.textures.exists('MouseCursor_Right')) {
            const wantTex = (side === 'left') ? 'MouseCursor_Left' : 'MouseCursor_Right';
            if (s.crosshair.texture && s.crosshair.texture.key !== wantTex) s.crosshair.setTexture(wantTex);
            s.crosshair.setScale(1).setAlpha(alpha).clearTint();   // (用户) 带 L/R 字母的光标用原色
        } else {
            s.crosshair.setScale(1).setAlpha(alpha).setTint(0xffff00);
        }
    }

    /**
     * 瞬发投出铁镐（永远是满蓄力、可钉墙状态）
     */
    releaseThrow(pointer) {
        const s = this.scene;
        let side = s.player.pState.activeHand;

        // 当前手没有铁镐则退出
        if (!s.inv[side]) return;

        // 命中 mob/boss 收回后 0.2s 冷却 — 防止瞬间连投
        if (s._pickThrowCooldownUntil && s.time.now < s._pickThrowCooldownUntil) return;

        // 重置该手绳索节点到玩家位置
        if (side === 'left') { s.activeStart1 = 0; s.activeEnd1 = 14; }
        else                 { s.activeStart2 = 0; s.activeEnd2 = 14; }

        let nodes = (side === 'left') ? s.ropeNodes1 : s.ropeNodes2;
        nodes.forEach(n => { n.x = s.player.x; n.y = s.player.y; n.ox = s.player.x; n.oy = s.player.y; });

        let pick = (side === 'left') ? s.pick1 : s.pick2;
        
        pick.isHeavy = true; // 强制设为重击状态（打中必钉墙）
        pick.body.checkCollision.none = false;
        
        // 获取鼠标在世界中的真实绝对坐标
        let worldPoint = s.cameras.main.getWorldPoint(pointer.x, pointer.y);

        // 抛出动能 1800 — 扫掠检测保证不穿墙
        pick.fire(
            s.player.x, s.player.y,
            worldPoint.x, worldPoint.y, 
            1800, 
            true
        );

        s.inv[side] = false;
    }
}