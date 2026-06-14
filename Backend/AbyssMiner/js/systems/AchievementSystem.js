/**
 * AchievementSystem — (用户) 成就系统
 * 账号级持久化 (localStorage 'abyssMinerAchievements'): 不随新游戏/删档清空.
 * 解锁瞬间屏幕顶部弹金色横幅; 查看面板从 Settings 左栏 ★ ACHIEVEMENTS 打开 (标题/局内通用).
 *
 * 触发点分布:
 *   tut_signpost  InteractSystem 路牌交互 (Tutorial)
 *   sz1_hidden    Hint 实体 (SZ1 创建处传 achId)
 *   sz2_surgical  Golem.die (双手皆 ≤0)
 *   sz25_allcry   CrystalBlock._destroy (SZ2.5 全灭 + 本区未死)
 *   sz3_toy       SZ3 玩具交付分支
 *   sz4_headwind  BatBoss 死亡 (scene._achNestBroken 为假)
 *   sz5_clutch    SpiderQueenBoss.die (本区未死)
 *   one_life      SpiderQueenBoss.die (registry runDeaths === 0)
 *   rock_bottom   HealthSystem.updateUI / DiseaseSystem._updateUI (腐蚀 ≥100 且 hp === 1)
 *   best_friend   ShopSystem 购买彩蛋
 */
const AchievementSystem = {
    DEFS: [
        { id: 'tut_signpost',  title: "You Shouldn't Be Here",   desc: 'Find the signpost and hear it out' },
        { id: 'sz1_hidden',    title: 'Memento Mori',             desc: "Find the hidden pioneer's remains" },
        { id: 'sz2_surgical',  title: 'Surgical Precision',       desc: "Sever both of the Golem's hands before finishing it" },
        { id: 'sz25_allcry',   title: 'Fortune Favors the Bold',  desc: 'Mine every crystal in one deathless run while the mob tide hunts you' },
        { id: 'sz3_toy',       title: 'Lost and Found',           desc: 'Find the lost toy and return it to its owner' },
        { id: 'sz4_headwind',  title: 'Against the Wind',         desc: 'Defeat the Bat Boss without breaking a single nest' },
        { id: 'one_life',      title: 'Untouchable',              desc: 'Beat the entire game without a single death' },
        { id: 'rock_bottom',   title: 'How Did It Come to This?', desc: 'Reach 100% radiation with exactly 1 HP remaining' },
        { id: 'best_friend',   title: 'Itsy Bitsy Buddy',         desc: 'Buy the Mysterious Egg' },
        { id: 'clear_easy',    title: 'First Descent',            desc: 'Beat Easy Mode for the first time' },
        { id: 'clear_normal',  title: 'Seasoned Miner',           desc: 'Beat Normal Mode for the first time' },
        { id: 'clear_hard',    title: 'Forged in Fire',           desc: 'Beat Hard Mode for the first time' },
        { id: 'clear_extreme', title: 'Conqueror of the Abyss',   desc: 'Beat Extreme Mode for the first time' },
    ],

    _load() { try { return JSON.parse(localStorage.getItem('abyssMinerAchievements') || '{}'); } catch (e) { return {}; } },
    _save(d) { try { localStorage.setItem('abyssMinerAchievements', JSON.stringify(d)); } catch (e) {} },
    isUnlocked(id) { return !!this._load()[id]; },

    /** 解锁 (重复调用安全): 写存储 + 弹横幅 */
    unlock(scene, id) {
        const d = this._load();
        if (d[id]) return false;
        d[id] = Date.now();
        this._save(d);
        const def = this.DEFS.find(a => a.id === id);
        this._toast(scene, def ? def.title : id);
        if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(scene, 'Achievement');   // (用户) 获得成就音效, 播 1 次
        return true;
    },

    /** 顶部金色横幅 (3.2s 后收回) */
    _toast(scene, title) {
        if (!scene || !scene.add || !scene.tweens) return;
        try {
            const W = scene.scale.width;
            const items = [];
            const bg = scene.add.rectangle(W / 2, -34, 380, 56, 0x111122, 0.94)
                .setStrokeStyle(2, 0xffcc44).setScrollFactor(0).setDepth(30000);
            const t1 = scene.add.text(W / 2, -44, '★ ACHIEVEMENT UNLOCKED ★', {
                fontSize: '15px', color: '#ffcc44', fontFamily: '"VT323", monospace'
            }).setOrigin(0.5).setScrollFactor(0).setDepth(30001);
            const t2 = scene.add.text(W / 2, -22, title, {
                fontSize: '24px', color: '#ffffff', fontFamily: '"VT323", monospace'
            }).setOrigin(0.5).setScrollFactor(0).setDepth(30001);
            items.push(bg, t1, t2);
            if (scene.cameras && scene.cameras.main && scene.uiCam) { try { scene.cameras.main.ignore(items); } catch (e) {} }
            scene.tweens.add({ targets: items, y: '+=78', duration: 350, ease: 'Back.Out' });
            scene.time.delayedCall(3200, () => {
                if (!scene.tweens) { items.forEach(o => { try { o.destroy(); } catch (e) {} }); return; }
                scene.tweens.add({
                    targets: items, y: '-=78', alpha: 0, duration: 300,
                    onComplete: () => items.forEach(o => { try { o.destroy(); } catch (e) {} })
                });
            });
        } catch (e) {}
    },

    /** 成就一览面板 — 卡片化排版: 头部进度条 + 徽章图标 + 解锁日期; 滚轮/拖滑块滚动, 点外侧暗区或 ✕ 关闭 */
    showPanel(scene) {
        if (!scene || !scene.add || this._panelOpen) return;
        this._panelOpen = true;
        try {
            const W = scene.scale.width, H = scene.scale.height;
            const items = [];
            const data = this._load();
            const total = this.DEFS.length;
            const gotN = this.DEFS.filter(a => !!data[a.id]).length;

            // ── 框架 ──
            const dim = scene.add.rectangle(W / 2, H / 2, W * 2, H * 2, 0x000000, 0.66)
                .setScrollFactor(0).setDepth(25000).setInteractive();
            const bg = scene.add.rectangle(W / 2, H / 2, 660, 664, 0x0b0b12, 0.98)
                .setStrokeStyle(2, 0x806020).setScrollFactor(0).setDepth(25001)
                .setInteractive();   // 吸收面板内点击, 防点穿误关
            const inner = scene.add.rectangle(W / 2, H / 2, 644, 648, 0x000000, 0)
                .setStrokeStyle(1, 0xffcc44, 0.3).setScrollFactor(0).setDepth(25001);
            const title = scene.add.text(W / 2, H / 2 - 300, '★ ACHIEVEMENTS ★', {
                fontSize: '36px', color: '#ffd86a', fontFamily: '"VT323", monospace',
                stroke: '#000', strokeThickness: 5, letterSpacing: 4
            }).setOrigin(0.5).setScrollFactor(0).setDepth(25002);
            const closeB = scene.add.text(W / 2 + 306, H / 2 - 306, '✕', {
                fontSize: '28px', color: '#ff5555', fontFamily: '"VT323", monospace',
                stroke: '#000', strokeThickness: 3
            }).setOrigin(0.5).setScrollFactor(0).setDepth(25003).setInteractive();
            items.push(dim, bg, inner, title, closeB);

            // ── 头部进度条 + 计数 ──
            const pbY = H / 2 - 270, pbW = 480;
            const pbTrack = scene.add.rectangle(W / 2 - 40, pbY, pbW, 8, 0x23232f, 1)
                .setStrokeStyle(1, 0x3a3a4c, 1).setScrollFactor(0).setDepth(25002);
            const pbFill = scene.add.rectangle(W / 2 - 40 - pbW / 2, pbY, Math.max(2, pbW * gotN / total), 6, 0xffcc44, 1)
                .setOrigin(0, 0.5).setScrollFactor(0).setDepth(25003);
            const pbTxt = scene.add.text(W / 2 + 232, pbY, gotN + ' / ' + total, {
                fontSize: '20px', color: '#ffcc44', fontFamily: '"VT323", monospace'
            }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(25002);
            const divider = scene.add.rectangle(W / 2, H / 2 - 254, 620, 1, 0x444458, 1)
                .setScrollFactor(0).setDepth(25002);
            items.push(pbTrack, pbFill, pbTxt, divider);

            // ── 卡片行 (滚动容器 + 遮罩) ──
            const VIEW_TOP = H / 2 - 246, VIEW_H = 536, ROW_H = 64;
            const CARD_W = 592, CARD_L = W / 2 - 304;
            const rowsC = scene.add.container(0, 0).setDepth(25002).setScrollFactor(0);
            this.DEFS.forEach((a, i) => {
                const y = VIEW_TOP + 34 + i * ROW_H;
                const got = !!data[a.id];
                // 卡片底 + 左侧描金条
                const card = scene.add.rectangle(CARD_L + CARD_W / 2, y, CARD_W, 56, got ? 0x1c1828 : 0x121219, 1)
                    .setStrokeStyle(1, got ? 0x6a5a2a : 0x2a2a38, 1);
                const accent = scene.add.rectangle(CARD_L + 3, y, 5, 56, got ? 0xffcc44 : 0x3a3a48, 1);
                // 徽章
                const medal = scene.add.circle(CARD_L + 36, y, 16, got ? 0xffcc44 : 0x23232f, 1)
                    .setStrokeStyle(2, got ? 0xfff0b0 : 0x3a3a4c, 1);
                const mark = scene.add.text(CARD_L + 36, y + 1, got ? '✓' : '✕', {
                    fontSize: '22px', color: got ? '#1a1408' : '#555566', fontFamily: '"VT323", monospace'
                }).setOrigin(0.5);
                // 文案
                const tt = scene.add.text(CARD_L + 64, y - 12, a.title, {
                    fontSize: '24px', color: got ? '#ffd86a' : '#8a8a99', fontFamily: '"VT323", monospace'
                }).setOrigin(0, 0.5);
                const dd = scene.add.text(CARD_L + 64, y + 14, a.desc, {
                    fontSize: '15px', color: got ? '#b9b9c9' : '#52525f', fontFamily: '"VT323", monospace'
                }).setOrigin(0, 0.5);
                rowsC.add([card, accent, medal, mark, tt, dd]);
                // 解锁日期 (右上角小字)
                if (got) {
                    const dt = new Date(data[a.id]);
                    const ds = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
                    rowsC.add(scene.add.text(CARD_L + CARD_W - 10, y - 14, ds, {
                        fontSize: '13px', color: '#8a7a4a', fontFamily: '"VT323", monospace'
                    }).setOrigin(1, 0.5));
                }
            });
            items.push(rowsC);

            const maskG = scene.make.graphics({}, false);
            maskG.fillStyle(0xffffff).fillRect(W / 2 - 320, VIEW_TOP, 640, VIEW_H);
            rowsC.setMask(maskG.createGeometryMask());

            // ── 滚动: 滚轮 + 右侧滑轨/滑块 ──
            const contentH = this.DEFS.length * ROW_H + 16;
            const minY = Math.min(0, VIEW_H - contentH);
            let barThumb = null;
            const BAR_X = W / 2 + 310, THUMB_H = Math.max(40, Math.round(VIEW_H * VIEW_H / contentH));
            const syncBar = () => {
                if (!barThumb) return;
                const ratio = minY < 0 ? (rowsC.y / minY) : 0;
                barThumb.y = VIEW_TOP + THUMB_H / 2 + ratio * (VIEW_H - THUMB_H);
            };
            if (contentH > VIEW_H) {
                const track = scene.add.rectangle(BAR_X, VIEW_TOP + VIEW_H / 2, 10, VIEW_H, 0x23232f, 1)
                    .setStrokeStyle(1, 0x3a3a4c, 0.9).setScrollFactor(0).setDepth(25010);
                barThumb = scene.add.rectangle(BAR_X, VIEW_TOP + THUMB_H / 2, 10, THUMB_H, 0xffcc44, 1)
                    .setStrokeStyle(1, 0xfff0b0, 0.7).setScrollFactor(0).setDepth(25011).setInteractive();
                scene.input.setDraggable(barThumb);
                barThumb.on('drag', (pointer, dragX, dragY) => {
                    const t = Phaser.Math.Clamp((dragY - VIEW_TOP - THUMB_H / 2) / (VIEW_H - THUMB_H), 0, 1);
                    rowsC.y = t * minY;
                    syncBar();
                });
                items.push(track, barThumb);
            }
            const onWheel = (pointer, objs, dx, dy) => {
                rowsC.y = Phaser.Math.Clamp(rowsC.y - dy * 0.5, minY, 0);
                syncBar();
            };
            scene.input.on('wheel', onWheel);

            if (scene.cameras && scene.cameras.main && scene.uiCam) { try { scene.cameras.main.ignore(items); } catch (e) {} }
            const close = () => {
                this._panelOpen = false;
                try { scene.input.off('wheel', onWheel); } catch (e) {}
                try { maskG.destroy(); } catch (e) {}
                items.forEach(o => { try { o.destroy(); } catch (e) {} });
            };
            // (用户) 点面板外空地不再关闭 — 仅 \u2715 可关 (dim 保持 interactive 吞点击)
            closeB.on('pointerdown', close);
            closeB.on('pointerover', () => closeB.setColor('#ff2222'));
            closeB.on('pointerout',  () => closeB.setColor('#ff5555'));
        } catch (e) { this._panelOpen = false; }   // 渲染抛错不卡死开关
    }
};