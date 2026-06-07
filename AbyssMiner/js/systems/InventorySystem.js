/**
 * InventorySystem — 9 格物品栏 + 左右手系统
 *
 * - 格子 0/1 默认：左手铁镐 / 右手铁镐（pickaxe）
 * - 左手选中格 = 黄色加粗边框
 * - 右手选中格 = 蓝色加粗边框
 * - 左右手不能同时选中同一个格子
 * - 购买新物品从最左侧空格开始放
 * - 药水可堆叠（同种），最多 64；铁镐不可堆叠（1 个）
 * - 堆叠数 > 1 时右下角显示数字
 */
class InventorySystem {
    constructor(scene) {
        this.scene = scene;
        this.SLOT_COUNT = 9;
        this.slots = new Array(this.SLOT_COUNT).fill(null);

        // 初始：slot 0 = 左手铁镐，slot 1 = 右手铁镐
        this.slots[0] = { type: 'pickaxe', side: 'left',  count: 1, cooldown: 0, cooldownMax: 0 };
        this.slots[1] = { type: 'pickaxe', side: 'right', count: 1, cooldown: 0, cooldownMax: 0 };

        this.leftHandSlot  = 0;
        this.rightHandSlot = 1;
        this.activeHand = 'left';

        // UI 元素
        this.slotBg = [];
        this.slotIcons = [];
        this.slotCountText = [];
        this.slotCooldownOverlay = [];
        this.slotLabels = []; // 【新增】保存 1-9 数字标签引用
    }

    init() {
        const s = this.scene;
        let slotSize = 60;
        let gap = 6;
        let totalW = this.SLOT_COUNT * slotSize + (this.SLOT_COUNT - 1) * gap;
        let startX = (s.cameras.main.width - totalW) / 2 + slotSize / 2;
        let y = s.cameras.main.height - 50;

        for (let i = 0; i < this.SLOT_COUNT; i++) {
            let x = startX + i * (slotSize + gap);
            // 背景格子
            let bg = s.add.rectangle(x, y, slotSize, slotSize, 0x222222, 0.75)
                .setStrokeStyle(2, 0xffffff).setScrollFactor(0).setDepth(200);
            this.slotBg.push(bg);

            // 道具图标（初始为 null）
            let icon = s.add.image(x, y, '__WHITE').setScrollFactor(0).setDepth(201).setVisible(false);
            this.slotIcons.push(icon);

            // 堆叠数量
            let txt = s.add.text(x + 20, y + 18, '', {
                fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
                fontFamily: '"VT323", monospace', stroke: '#000', strokeThickness: 3
            }).setOrigin(1, 1).setScrollFactor(0).setDepth(202).setVisible(false);
            this.slotCountText.push(txt);

            // 冷却遮罩（灰色） —— origin 固定在底部，高度从 slotSize 缩短到 0
            // 视觉效果：遮罩从上往下消失（底边固定，顶边往下推）
            let cd = s.add.rectangle(x, y + slotSize / 2, slotSize, 0, 0x000000, 0.6)
                .setOrigin(0.5, 1).setScrollFactor(0).setDepth(203).setVisible(false);
            this.slotCooldownOverlay.push(cd);

            // 数字 1-9 的标签
            let lbl = s.add.text(x - slotSize / 2 + 3, y - slotSize / 2 + 2, (i + 1).toString(), {
                fontSize: '24px', color: '#aaaaaa', fontFamily: '"VT323", monospace'
            }).setScrollFactor(0).setDepth(204);
            this.slotLabels.push(lbl);
        }

        this.refresh();
    }

    /** 切换当前活跃手 (F 键) */
    toggleHand() {
        this.activeHand = (this.activeHand === 'left') ? 'right' : 'left';
        if (this.scene.player && this.scene.player.pState) {
            this.scene.player.pState.activeHand = this.activeHand;
        }
        this.refresh();
    }

    /** 数字键 1-9 选择格子到当前手 */
    selectSlot(slotIndex) {
        if (slotIndex < 0 || slotIndex >= this.SLOT_COUNT) return;
        // 左右手不能选同一个格子
        if (this.activeHand === 'left') {
            if (slotIndex === this.rightHandSlot) return;
            this.leftHandSlot = slotIndex;
        } else {
            if (slotIndex === this.leftHandSlot) return;
            this.rightHandSlot = slotIndex;
        }
        this.refresh();
    }

    /**
     * 添加物品（购买时调用）
     * @returns true=成功  false=背包满
     */
    addItem(type, count = 1, opts) {
        const _req = count;
        // 先尝试堆叠到同种类（除铁镐外）
        if (type !== 'pickaxe') {
            for (let i = 0; i < this.SLOT_COUNT; i++) {
                let s = this.slots[i];
                if (s && s.type === type && s.count < 64) {
                    let canAdd = Math.min(count, 64 - s.count);
                    s.count += canAdd;
                    count -= canAdd;
                    if (count === 0) { this.refresh(); this._pickupSfx(opts); return true; }
                }
            }
        }
        // 再找空格放
        for (let i = 0; i < this.SLOT_COUNT && count > 0; i++) {
            if (this.slots[i] === null) {
                let putAmt = (type === 'pickaxe') ? 1 : count;
                this.slots[i] = {
                    type: type, count: putAmt,
                    cooldown: 0, cooldownMax: 0
                };
                count -= putAmt;
                if (type === 'pickaxe') break;
            }
        }
        this.refresh();
        if (_req - count > 0) this._pickupSfx(opts);
        return count === 0;
    }

    // (用户) 拾取音效 2选1 随机, 无 CD; opts.silent 跳过 (商店购买等非拾取入口)
    _pickupSfx(opts) {
        if (opts && opts.silent) return;
        if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this.scene, Math.random() < 0.5 ? 'Pickup1' : 'Pickup2');
    }

    /** 背包是否还有空间装此物品 */
    canAdd(type, count = 1) {
        if (type !== 'pickaxe') {
            for (let i = 0; i < this.SLOT_COUNT; i++) {
                let s = this.slots[i];
                if (s && s.type === type && (s.count + count) <= 64) return true;
            }
        }
        for (let i = 0; i < this.SLOT_COUNT; i++) {
            if (this.slots[i] === null) return true;
        }
        return false;
    }

    /** 获取当前手上握着的物品 */
    getActiveItem() {
        let idx = (this.activeHand === 'left') ? this.leftHandSlot : this.rightHandSlot;
        return this.slots[idx];
    }

    /** 当前手上的物品数 -1 */
    consumeActiveItem() {
        let idx = (this.activeHand === 'left') ? this.leftHandSlot : this.rightHandSlot;
        let slot = this.slots[idx];
        if (!slot) return;
        slot.count--;
        if (slot.count <= 0) this.slots[idx] = null;
        this.refresh();
    }

    /** 启动当前格子 CD */
    startCooldown(durationMs) {
        let idx = (this.activeHand === 'left') ? this.leftHandSlot : this.rightHandSlot;
        let slot = this.slots[idx];
        if (!slot) return;
        // 给该类型的所有格子都开 CD（因为堆叠共享 CD）
        let type = slot.type;
        for (let i = 0; i < this.SLOT_COUNT; i++) {
            if (this.slots[i] && this.slots[i].type === type) {
                this.slots[i].cooldown = durationMs;
                this.slots[i].cooldownMax = durationMs;
            }
        }
        this.refresh();
    }

    /** 每帧更新冷却 */
    update(delta) {
        let dirty = false;
        for (let i = 0; i < this.SLOT_COUNT; i++) {
            let s = this.slots[i];
            if (s && s.cooldown > 0) {
                s.cooldown = Math.max(0, s.cooldown - delta);
                dirty = true;
            }
        }
        if (dirty) this.refresh();
    }

    /** 重新绘制所有 UI */
    refresh() {
        // 阶段 6: 同步 BackpackSystem 的 Z/X/C 类型锁定槽
        if (this.scene.backpackSystem && this.scene.backpackSystem.refreshQuick) {
            this.scene.backpackSystem.refreshQuick();
        }
        for (let i = 0; i < this.SLOT_COUNT; i++) {
            let slot = this.slots[i];
            let bg = this.slotBg[i];
            let icon = this.slotIcons[i];
            let txt = this.slotCountText[i];
            let cd = this.slotCooldownOverlay[i];

            // 边框高亮：左手=黄 右手=蓝
            if (i === this.leftHandSlot) {
                bg.setStrokeStyle(4, 0xffff00);
                bg.setFillStyle(0x3a3a00, 0.85);
            } else if (i === this.rightHandSlot) {
                bg.setStrokeStyle(4, 0x00aaff);
                bg.setFillStyle(0x002a3a, 0.85);
            } else {
                bg.setStrokeStyle(2, 0xffffff);
                bg.setFillStyle(0x222222, 0.75);
            }

            // 物品图标
            if (slot) {
                let texKey;
                switch (slot.type) {
                    case 'pickaxe':         texKey = 'pickaxe_img'; break;
                    case 'healing_potion':  texKey = (this.scene && this.scene.textures.exists('HpPotion')) ? 'HpPotion' : 'potion_heal_img'; break;
                    case 'life_potion':     texKey = 'potion_life_img'; break;
                    case 'health_potion':   texKey = 'potion_health_img'; break;
                    case 'shield_potion':   texKey = 'potion_shield_img'; break;
                    case 'key':             texKey = 'key_img'; break;
                    default: texKey = 'pickaxe_img';
                }
                icon.setTexture(texKey).setVisible(true);
                icon.setDisplaySize(36, 36);

                // 堆叠数
                if (slot.count > 1) {
                    txt.setText(slot.count.toString()).setVisible(true);
                } else {
                    txt.setVisible(false);
                }

                // CD 灰色遮罩（从上往下恢复，遮罩高度从 slotSize → 0）
                if (slot.cooldown > 0 && slot.cooldownMax > 0) {
                    let pct = slot.cooldown / slot.cooldownMax;
                    let slotSize = 60;
                    cd.setVisible(true);
                    // 用 setSize 强制重绘，origin (0.5, 1) 配合实现底部固定、顶部往下推
                    cd.setSize(slotSize, slotSize * pct);
                } else {
                    cd.setVisible(false);
                }
            } else {
                icon.setVisible(false);
                txt.setVisible(false);
                cd.setVisible(false);
            }
        }

        // 同步玩家状态
        if (this.scene.player && this.scene.player.pState) {
            this.scene.player.pState.activeHand = this.activeHand;
        }
    }
}