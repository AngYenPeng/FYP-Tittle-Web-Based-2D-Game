/**
 * InteractSystem — E 键交互
 * 交互对象：
 *  - 地鼠商人 → 开商店
 *  - 水晶门（消耗水晶打开）
 *  - 钥匙门（消耗钥匙打开）
 *
 * 规则：周围 10 格（320px）内有怪物时禁止交互
 */
class InteractSystem {
    constructor(scene) {
        this.scene = scene;
        this.keyE = null;
        this._doorHintText = null;
    }

    init() {
        this.keyE = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    }

    // (用户) "周围 320px 有怪禁止交互" 判定已全链路移除 — 原 _hasMonsterNearby 删除 (早已是无调用孤儿)

    update() {
        const s = this.scene;
        if (!s.player) return;

        this._updateDoorHint();

        if (!Phaser.Input.Keyboard.JustDown(this.keyE)) return;

        // 商店开着 → E 关闭
        if (s.shopSystem && s.shopSystem.isOpen) {
            s.shopSystem.close();
            return;
        }
        // HUD 确认面板开着 → 不响应
        if (s.hudSystem && s.hudSystem.gamePausedByConfirm) return;

        // Checkpoint 神像 — 优先处理（不受怪物附近限制）; 激活后不再响应 E
        if (s._checkpoint && !s._checkpoint._buried && !s._checkpoint.activated) {
            const cp = s._checkpoint;
            const dist = Phaser.Math.Distance.Between(s.player.x, s.player.y, cp.x, cp.y);
            if (dist <= InteractSystem.RANGE) {
                cp.interact(s.player);
                return;
            }
        }

        // 钥匙门 — 优先处理（不受怪物附近限制 — 跟 Tutorial 一样）
        // 收集所有 keydoor (兼容旧 _keyDoor + 新 _keyDoor2 / _keyDoors 数组)
        const allKeyDoors = this._getAllKeyDoors();
        for (const door of allKeyDoors) {
            if (!door || door.opened) continue;
            const dist = Phaser.Math.Distance.Between(s.player.x, s.player.y, door.x, door.y);
            if (dist <= InteractSystem.RANGE) {
                this._tryOpenKeyDoor(door);
                return;
            }
        }

        // 水晶门 — 144px 范围 (用户: 取消怪物附近限制)
        if (s._crystalDoor && !s._crystalDoor.opened) {
            const dist = Phaser.Math.Distance.Between(s.player.x, s.player.y, s._crystalDoor.x, s._crystalDoor.y);
            if (dist <= InteractSystem.RANGE) {
                this._tryOpenCrystalDoor();
                return;
            }
        }

        // (用户) 取消"怪物附近禁止交互"限制 — 商人/SecretDoor/Signpost 不再受怪物影响

        // 3) 商人
        if (s.moleTrader && s.moleTrader.active) {
            const dist = Phaser.Math.Distance.Between(s.player.x, s.player.y, s.moleTrader.x, s.moleTrader.y);
            if (dist <= InteractSystem.RANGE) {
                this._interactMole();
                return;
            }
        }
        // 4) SecretDoor 传送门
        if (s._secretDoors) {
            for (const door of s._secretDoors) {
                if (door._destroyed) continue;
                if (door.isPlayerNear(s.player)) {
                    door.interact(s.player);
                    return;
                }
            }
        }
        // 5) Signpost 告示牌
        if (s._signposts) {
            for (const sign of s._signposts) {
                if (sign.isPlayerNear(s.player)) {
                    sign.interact(s.player);
                    if (typeof AchievementSystem !== 'undefined' && (s.scene.key || '').toLowerCase().includes('tutorial')) AchievementSystem.unlock(s, 'tut_signpost');   // (用户成就) 你不该在这里
                    return;
                }
            }
        }
    }

    _updateDoorHint() {
        const s = this.scene;

        // 剧情/对话期间 → 全部隐藏
        const inCinematicOrDialog = s._cinematicLock || (s.dialogSystem && s.dialogSystem.isOpen);

        // 找最近的可交互门（key/crystal，不含石门）
        let activeDoor = null;
        if (!inCinematicOrDialog) {
            const allKeyDoors = this._getAllKeyDoors();
            let bestDist = Infinity;
            for (const door of allKeyDoors) {
                if (!door || door.opened) continue;
                const d = Phaser.Math.Distance.Between(s.player.x, s.player.y, door.x, door.y);
                if (d <= 64 && d < bestDist) {
                    bestDist = d;
                    activeDoor = door;
                }
            }
            if (!activeDoor && s._crystalDoor && !s._crystalDoor.opened) {
                const dist = Phaser.Math.Distance.Between(s.player.x, s.player.y, s._crystalDoor.x, s._crystalDoor.y);
                if (dist <= InteractSystem.RANGE) activeDoor = s._crystalDoor;
            }
        }

        // 在活跃门上方显示 E icon（漂浮）
        if (activeDoor) {
            const baseX = activeDoor.x;
            const baseY = activeDoor.y - activeDoor.h / 2 - 20;
            if (!this._doorEIcon) {
                if (s.textures.exists('Trader_interection_icon')) {
                    this._doorEIcon = s.add.image(baseX, baseY, 'Trader_interection_icon').setDepth(500);
                } else {
                    this._doorEIcon = s.add.text(baseX, baseY, '[E]', {
                        fontSize: '20px', color: '#ffff88',
                        fontFamily: '"VT323", monospace',
                        stroke: '#000', strokeThickness: 3
                    }).setOrigin(0.5).setDepth(500);
                }
                if (s.uiCam) s.uiCam.ignore(this._doorEIcon);
                this._doorEIconTween = s.tweens.add({
                    targets: this._doorEIcon,
                    y: baseY - 10, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
                });
            }
            // 只更新 x (y 由 tween 控制，不覆盖)
            this._doorEIcon.x = baseX;
            this._doorEIcon.setVisible(true);
        } else if (this._doorEIcon) {
            this._doorEIcon.destroy();
            if (this._doorEIconTween) { this._doorEIconTween.stop(); this._doorEIconTween = null; }
            this._doorEIcon = null;
        }

        if (this._doorHintText) {
            this._doorHintText.destroy();
            this._doorHintText = null;
        }

        // SecretDoor / Signpost — 剧情/对话期间强制隐藏
        if (s._secretDoors) {
            for (const door of s._secretDoors) {
                if (door._destroyed) continue;
                door.setHintVisible(!inCinematicOrDialog && door.isPlayerNear(s.player));
            }
        }
        if (s._signposts) {
            for (const sign of s._signposts) {
                sign.setHintVisible(!inCinematicOrDialog && sign.isPlayerNear(s.player));
            }
        }
        // Checkpoint hint — 激活后不再显示 E 漂浮
        if (s._checkpoint && !s._checkpoint._buried) {
            const cp = s._checkpoint;
            if (cp.activated) {
                cp.setHintVisible(false);
            } else {
                const dist = Phaser.Math.Distance.Between(s.player.x, s.player.y, cp.x, cp.y);
                cp.setHintVisible(!inCinematicOrDialog && dist <= InteractSystem.RANGE);
            }
        }

        // 商人 E icon — 剧情/对话期间也隐藏
        if (s._npcMole && s._npcMole.interactionIcon) {
            const moleIcon = s._npcMole.interactionIcon;
            if (inCinematicOrDialog) {
                moleIcon.setVisible(false);
            }
            // 商人有自己的 setHintVisible 逻辑；这里只在剧情时强制隐藏
        }
    }

    /** 商人交互：根据剧情状态走不同分支 */
    _interactMole() {
        const s = this.scene;
        if (!s.dialogSystem) {
            if (s.shopSystem) s.shopSystem.open();
            return;
        }
        // 钥匙剧情已完成 → 只说一句
        if (s._keyPlotDone) {
            s.dialogSystem.show({
                speaker: 'Whisker',
                text: 'Now go, kid.'
            });
            return;
        }
        // 水晶任务激活 → "Got the goods?"
        if (s._crystalQuestActive) {
            s.dialogSystem.show({
                speaker: 'Whisker',
                text: 'Got the goods?',
                choices: [
                    {
                        label: 'Yes, take a look.',
                        action: () => {
                            s.dialogSystem.close();
                            if (s.shopSystem) s.shopSystem.open();
                        }
                    },
                    {
                        label: 'Leaving.',
                        action: () => s.dialogSystem.close()
                    }
                ]
            });
            return;
        }
        if (s.shopSystem) s.shopSystem.open();
    }

    _tryOpenCrystalDoor() {
        const s = this.scene;
        const door = s._crystalDoor;
        const cost = door.cost || 1;
        if (!s.dialogSystem) {
            // fallback：直接开
            if ((s.hudSystem.crystalCount || 0) < cost) return;
            s.hudSystem.addCrystal(-cost);
            door.open();
            return;
        }
        // 不够水晶 → 对话框提示
        if (!s.hudSystem || (s.hudSystem.crystalCount || 0) < cost) {
            s.dialogSystem.show({
                speaker: 'Crystal Door',
                text: `Not enough crystals. Need ${cost} crystal to open this door.`
            });
            return;
        }
        // 询问是否打开
        s.dialogSystem.show({
            speaker: 'Crystal Door',
            text: `Spend ${cost} crystal to open?`,
            choices: [
                { label: 'Yes', action: () => {
                    s.dialogSystem.close();
                    s.hudSystem.addCrystal(-cost);
                    door.open();
                }},
                { label: 'No', action: () => s.dialogSystem.close() }
            ]
        });
    }

    /** 收集所有 keydoor (兼容 _keyDoor / _keyDoor2 / _keyDoors 数组) */
    _getAllKeyDoors() {
        const s = this.scene;
        const list = [];
        if (Array.isArray(s._keyDoors)) {
            for (const d of s._keyDoors) if (d) list.push(d);
        }
        if (s._keyDoor && !list.includes(s._keyDoor)) list.push(s._keyDoor);
        if (s._keyDoor2 && !list.includes(s._keyDoor2)) list.push(s._keyDoor2);
        return list;
    }

    _tryOpenKeyDoor(door) {
        const s = this.scene;
        // 兼容旧调用 (无参数 → 用 s._keyDoor)
        door = door || s._keyDoor;
        if (!door) return;

        // 阶段 2：门已解锁 → 直接 open
        if (door.unlocked) {
            door.open();
            return;
        }
        // 守卫: 解锁动画进行中 → 不再弹对话 (防快速再按 E 重复吃钥匙)
        if (door._unlocking) return;

        if (!s.dialogSystem) return;

        // 阶段 1：找钥匙 (背包 inventory 'key' 槽 — 跟 Tutorial 商人/SZ1 骷髅奖励/SZ2 都是同一套)
        const inv = s.inventorySystem;
        if (!inv) return;
        let keySlotIdx = -1;
        for (let i = 0; i < inv.SLOT_COUNT; i++) {
            if (inv.slots[i] && inv.slots[i].type === 'key' && inv.slots[i].count > 0) {
                keySlotIdx = i;
                break;
            }
        }
        if (keySlotIdx === -1) {
            s.dialogSystem.show({
                speaker: 'Key Door',
                text: 'This door is locked. You need a key to open it.'
            });
            return;
        }
        s.dialogSystem.show({
            speaker: 'Key Door',
            text: 'Use 1 key to unlock this door?',
            choices: [
                { label: 'Yes', action: () => {
                    s.dialogSystem.close();
                    inv.slots[keySlotIdx].count--;
                    if (inv.slots[keySlotIdx].count <= 0) {
                        inv.slots[keySlotIdx] = null;
                    }
                    inv.refresh();
                    door.useKey();
                }},
                { label: 'No', action: () => s.dialogSystem.close() }
            ]
        });
    }

    _showHint(text, color = '#ffff88') {
        const s = this.scene;
        const W = s.cameras.main.width;
        const txt = s.add.text(W / 2, 200, text, {
            fontSize: '24px', color: color,
            fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 4,
            backgroundColor: '#00000099',
            padding: { x: 12, y: 8 }
        }).setOrigin(0.5).setScrollFactor(0).setDepth(300);
        if (s.uiCam) s.uiCam.ignore(txt);
        s.time.delayedCall(2000, () => txt.destroy());
    }

    /** 屏幕下方的小对话框提示（仿 DialogSystem 样式，1.6s 淡出） */
    _showBottomHint(text) {
        const s = this.scene;
        // 已有提示 → 先销毁
        if (this._bottomHint) {
            this._bottomHint.destroy();
            this._bottomHint = null;
        }
        const W = s.cameras.main.width;
        const H = s.cameras.main.height;

        const container = s.add.container(W / 2, H - 60)
            .setScrollFactor(0).setDepth(940);

        // 文字（先建好以测量尺寸）
        const txt = s.add.text(0, 0, text, {
            fontSize: '24px', color: '#ffcc88',
            fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 3,
            resolution: 2
        }).setOrigin(0.5);

        // 自适应宽高的深蓝底 + 青色边（跟 DialogSystem 同色板）
        const padX = 20, padY = 10;
        const bg = s.add.rectangle(0, 0, txt.width + padX * 2, txt.height + padY * 2, 0x0a0a18, 0.95)
            .setStrokeStyle(2, 0x6688aa);

        container.add([bg, txt]);

        // 让 mainCam ignore（只在 uiCam 渲染）
        s.time.delayedCall(50, () => {
            if (s.cameras.main && container.scene) {
                try { s.cameras.main.ignore(container); } catch(e) {}
            }
        });

        this._bottomHint = container;

        // 1.2s 后开始淡出，淡出 400ms
        s.tweens.add({
            targets: container,
            alpha: 0,
            duration: 400,
            delay: 1200,
            onComplete: () => {
                if (container && container.scene) container.destroy();
                if (this._bottomHint === container) this._bottomHint = null;
            }
        });
    }
}

// (用户) 全游戏统一交互距离 — E 图标出现距离与可交互距离严格相等, 所有可交互物共用此值
InteractSystem.RANGE = 80;