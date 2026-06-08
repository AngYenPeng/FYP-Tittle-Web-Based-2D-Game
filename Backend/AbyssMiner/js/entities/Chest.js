/**
 * Chest — 宝箱
 * 阶段 1+2:
 * - 靠近 (interactRange) → 显示 E 漂浮图标
 * - 按 E → 1 秒开启动画 (Chest_open 8 帧) → 停在最后一帧 → E 消失 → 一个个掉物品
 * - 掉落: 2-5 水晶 + 1-3 药水 (60% 治疗 / 10% 增命 / 30% 健康)
 * - 每个物品间隔 0.25 秒, 跳出抛物线落地 (不旋转), 之后磁吸进玩家
 * - 单次性: 开了不能再开
 */
class Chest {
    constructor(scene, col, row, options = {}) {
        this.scene = scene;
        const G = 32;
        this.col = col;
        this.row = row;
        this.x = col * G + G / 2;
        this.y = row * G + G / 2;
        this.interactRange = options.interactRange || ((typeof InteractSystem !== 'undefined' && InteractSystem.RANGE) || 80);   // (用户) 全游戏统一交互距离
        this.opened = false;
        this._dropping = false;
        this._hintVisible = false;
        this._eIconTween = null;
        this._isOpen = false; // 用于 interact 节流

        // 宝箱 sprite (默认 close)
        if (scene.textures.exists('Chest_close')) {
            this.sprite = scene.add.sprite(this.x, this.y, 'Chest_close');
            this.sprite.setDepth(10);
        } else {
            // fallback — 黄色矩形
            this.sprite = scene.add.rectangle(this.x, this.y, 45, 39, 0xccaa44, 1)
                .setStrokeStyle(2, 0x664422)
                .setDepth(10);
        }

        if (scene.uiCam) {
            try { scene.uiCam.ignore(this.sprite); } catch(e) {}
        }

        // 注册开启动画 (1 秒 = 8 帧, 所以 8fps)
        if (scene.textures.exists('Chest_open') && !scene.anims.exists('chest_open')) {
            scene.anims.create({
                key: 'chest_open',
                frames: scene.anims.generateFrameNumbers('Chest_open', { start: 0, end: 7 }),
                frameRate: 8,
                repeat: 0
            });
        }

        // E 漂浮图标 — 用 Trader_interection_icon (静态 E 图, 跟商人 / CrystalNpc 同款)
        if (scene.textures.exists('Trader_interection_icon')) {
            this.eIcon = scene.add.image(this.x, this.y - 39, 'Trader_interection_icon')
                .setDepth(500).setScale(1.2);
        } else if (scene.textures.exists('Hint')) {
            // fallback: Hint spritesheet (动画)
            if (!scene.anims.exists('hint_bounce')) {
                scene.anims.create({
                    key: 'hint_bounce',
                    frames: scene.anims.generateFrameNumbers('Hint', { start: 0, end: 6 }),
                    frameRate: 10,
                    repeat: -1
                });
            }
            this.eIcon = scene.add.sprite(this.x, this.y - 39, 'Hint', 0)
                .setDepth(500);
            this.eIcon.play('hint_bounce');
        } else {
            this.eIcon = scene.add.text(this.x, this.y - 39, '[E]', {
                fontSize: '20px', color: '#ffff66', fontFamily: '"VT323", monospace',
                stroke: '#000', strokeThickness: 4
            }).setOrigin(0.5).setDepth(500);
        }
        this.eIcon.setVisible(false);

        if (scene.uiCam) {
            try { scene.uiCam.ignore(this.eIcon); } catch(e) {}
        }

        if (!scene._chests) scene._chests = [];
        scene._chests.push(this);
    }

    _showHint() {
        if (this._hintVisible || this.opened) return;
        this._hintVisible = true;
        this.eIcon.setVisible(true);
        this.eIcon.y = this.y - 39;
        this._eIconTween = this.scene.tweens.add({
            targets: this.eIcon,
            y: '-=10', duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
    }

    _hideHint() {
        if (!this._hintVisible) return;
        this._hintVisible = false;
        this.eIcon.setVisible(false);
        if (this._eIconTween) {
            this.scene.tweens.killTweensOf(this.eIcon);
            this._eIconTween = null;
        }
    }

    update() {
        if (this.opened) return;
        if (!this.scene.player || !this.scene.player.body) return;
        const dx = this.scene.player.x - this.x;
        const dy = this.scene.player.y - this.y;
        const inRange = (dx*dx + dy*dy) < this.interactRange * this.interactRange;

        const _inCin = this.scene._cinematicLock || (this.scene.dialogSystem && this.scene.dialogSystem.isOpen);   // (用户) 剧情/对话期间不可交互, 也不显示 E 提示
        if (inRange && !_inCin) this._showHint();
        else this._hideHint();

        if (inRange && !_inCin && !this._isOpen && this.scene.keyE && Phaser.Input.Keyboard.JustDown(this.scene.keyE)) {
            this._isOpen = true;
            this._open();
        }
    }

    _open() {
        if (this.opened) return;
        this.opened = true;
        this._hideHint();
        // 永久销毁 E icon
        if (this.eIcon && this.eIcon.destroy) this.eIcon.destroy();

        // 播放开启动画 (1 秒)
        if (this.sprite.play && this.scene.anims.exists('chest_open')) {
            // 把 sprite 切到 Chest_open spritesheet 然后播
            this.sprite.setTexture('Chest_open', 0);
            if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this.scene, 'ChestOpen');
            this.sprite.play('chest_open');
            this.sprite.once('animationcomplete', () => {
                // 停在最后一帧
                this.sprite.setFrame(7);
                this._startDropping();
            });
        } else {
            // 没动画: 直接掉落
            this._startDropping();
        }
    }

    _startDropping() {
        // 随机数量
        const crystalCount = 2 + Math.floor(Math.random() * 4);  // 2-5
        const potionCount  = 1 + Math.floor(Math.random() * 3);  // 1-3

        const items = [];
        for (let i = 0; i < crystalCount; i++) items.push({ kind: 'crystal' });
        for (let i = 0; i < potionCount; i++) {
            const r = Math.random();
            // (用户) 加命药水移出宝箱掉落 — 只出 回血60% / 健康40%
            if (r < 0.60)       items.push({ kind: 'potion', type: 'healing_potion' });
            else                items.push({ kind: 'potion', type: 'health_potion' });
        }

        // 一个个掉落, 间隔 0.25 秒
        items.forEach((it, idx) => {
            this.scene.time.delayedCall(idx * 250, () => this._dropOne(it));
        });
    }

    /** 单个物品掉落 — 抛物线 (无旋转), 落地后磁吸到玩家 */
    _dropOne(it) {
        const s = this.scene;
        // 随机落地点 (附近 30-60 px)
        const angle = Math.random() * Math.PI * 2;
        const radius = 30 + Math.random() * 30;
        let targetX = this.x + Math.cos(angle) * radius;
        let targetY = this.y + Math.sin(angle) * radius + 10;  // 略低于宝箱中心

        // 防穿模 + 一定落地 — 参考垂丝蜘蛛 (CrystalBungeeSpider) 的 raycast 向下找 floor:
        // 1. 在 targetX 这一列从 chest.y 向下找最近的墙顶 (nearestFloorY)
        // 2. 没找到 → 该列是 void → 物品弹回 chest 旁边
        // 3. 找到了 → 不管 targetY 在哪, 强制钉到 floor 顶上 (避免漂在半空)
        if (s.wallRects) {
            let nearestFloorY = Infinity;
            for (const w of s.wallRects) {
                if (targetX >= w.left && targetX <= w.right && w.top >= this.y - 4) {
                    if (w.top < nearestFloorY) nearestFloorY = w.top;
                }
            }
            if (nearestFloorY === Infinity) {
                // 该 X 列没 floor (悬崖外) — 物品掉回 chest 旁
                targetX = this.x + (Math.random() < 0.5 ? -1 : 1) * (12 + Math.random() * 8);
                targetY = this.y + 8;
                // 重新对新 targetX 也找一次 floor (兜底)
                for (const w of s.wallRects) {
                    if (targetX >= w.left && targetX <= w.right && w.top >= this.y - 4) {
                        if (w.top < targetY + 16) {
                            targetY = Math.min(targetY, w.top - 4);
                        }
                    }
                }
            } else {
                // 找到 floor → 总是落地 (不允许半空)
                targetY = nearestFloorY - 4;
            }
        }

        let texKey, displaySize;
        if (it.kind === 'crystal') {
            texKey = s.textures.exists('Crystal') ? 'Crystal' : 'drop_crystal_img';
            displaySize = (texKey === 'Crystal') ? 20 : 18;
        } else {
            // potion
            switch (it.type) {
                case 'healing_potion': texKey = s.textures.exists('HpPotion') ? 'HpPotion' : 'potion_heal_img'; break;
                case 'life_potion':    texKey = 'potion_life_img'; break;
                case 'health_potion':  texKey = 'potion_health_img'; break;
                default:               texKey = s.textures.exists('HpPotion') ? 'HpPotion' : 'potion_heal_img';
            }
            displaySize = 26;
        }

        const sprite = s.add.image(this.x, this.y - 8, texKey);
        if (displaySize) sprite.setDisplaySize(displaySize, displaySize);
        sprite.setDepth(700);  // > player (600), < fog (810)
        if (s.uiCam) {
            try { s.uiCam.ignore(sprite); } catch(e) {}
        }
        sprite._isChestDrop = true;
        sprite._dropKind = it.kind;
        sprite._dropType = it.type;
        sprite._pickupReadyAt = s.time.now + 1000;  // 1 秒后才可拾取
        sprite.active = true;

        if (!s._chestDrops) s._chestDrops = [];
        s._chestDrops.push(sprite);

        // 抛物线 (不旋转)
        const peakY = Math.min(this.y, targetY) - 25 - Math.random() * 15;
        const dur = 350;
        s.tweens.add({
            targets: sprite,
            x: targetX,
            duration: dur,
            ease: 'Linear'
        });
        s.tweens.add({
            targets: sprite,
            y: peakY,
            duration: dur / 2,
            ease: 'Quad.easeOut',
            onComplete: () => {
                s.tweens.add({
                    targets: sprite,
                    y: targetY,
                    duration: dur / 2,
                    ease: 'Quad.easeIn'
                });
            }
        });
    }

    destroy() {
        if (this._eIconTween) this.scene.tweens.killTweensOf(this.eIcon);
        if (this.eIcon && this.eIcon.destroy) this.eIcon.destroy();
        if (this.sprite && this.sprite.destroy) this.sprite.destroy();
        if (this.scene._chests) {
            const i = this.scene._chests.indexOf(this);
            if (i >= 0) this.scene._chests.splice(i, 1);
        }
    }
}