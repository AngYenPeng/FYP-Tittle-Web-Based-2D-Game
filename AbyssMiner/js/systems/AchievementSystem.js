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
        { id: 'sz5_clutch',    title: 'By a Thread',              desc: 'Slay the Spider Queen without dying once' },
        { id: 'one_life',      title: 'Untouchable',              desc: 'Beat the entire game without a single death' },
        { id: 'rock_bottom',   title: 'How Did It Come to This?', desc: 'Reach 100% corrosion with exactly 1 HP remaining' },
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

    /** 成就一览面板 (Settings 左栏 / Title 主菜单入口; 滚轮滚动列表, 点遮罩或 ✕ 关闭) */
    showPanel(scene) {
        if (!scene || !scene.add || this._panelOpen) return;
        this._panelOpen = true;
        try {
            const W = scene.scale.width, H = scene.scale.height;
            const items = [];
            const dim = scene.add.rectangle(W / 2, H / 2, W * 2, H * 2, 0x000000, 0.6)
                .setScrollFactor(0).setDepth(25000).setInteractive();
            const bg = scene.add.rectangle(W / 2, H / 2, 640, 660, 0x0d0d14, 0.97)
                .setStrokeStyle(2, 0xffcc44).setScrollFactor(0).setDepth(25001);
            const title = scene.add.text(W / 2, H / 2 - 300, '★ ACHIEVEMENTS ★', {
                fontSize: '34px', color: '#ffcc44', fontFamily: '"VT323", monospace',
                stroke: '#000', strokeThickness: 4
            }).setOrigin(0.5).setScrollFactor(0).setDepth(25002);
            const closeB = scene.add.text(W / 2 + 298, H / 2 - 304, '✕', {
                fontSize: '28px', color: '#ff5555', fontFamily: '"VT323", monospace',
                stroke: '#000', strokeThickness: 3
            }).setOrigin(0.5).setScrollFactor(0).setDepth(25002).setInteractive();
            items.push(dim, bg, title, closeB);

            // ── 滚动行容器 (遮罩裁切视窗 + 滚轮) ──
            const VIEW_TOP = H / 2 - 268, VIEW_H = 556, ROW_H = 58;
            const rowsC = scene.add.container(0, 0).setDepth(25002).setScrollFactor(0);
            const data = this._load();
            this.DEFS.forEach((a, i) => {
                const y = VIEW_TOP + 26 + i * ROW_H;
                const got = !!data[a.id];
                const icon = scene.add.text(W / 2 - 292, y, got ? '✓' : '✕', {
                    fontSize: '26px', color: got ? '#66ff88' : '#444455', fontFamily: '"VT323", monospace'
                }).setOrigin(0, 0.5);
                const tt = scene.add.text(W / 2 - 256, y - 13, a.title, {
                    fontSize: '24px', color: got ? '#ffcc44' : '#8a8a99', fontFamily: '"VT323", monospace'
                }).setOrigin(0, 0.5);
                const dd = scene.add.text(W / 2 - 256, y + 15, a.desc, {
                    fontSize: '16px', color: got ? '#bbbbcc' : '#55556a', fontFamily: '"VT323", monospace'
                }).setOrigin(0, 0.5);
                rowsC.add([icon, tt, dd]);
            });
            items.push(rowsC);

            const maskG = scene.make.graphics();
            maskG.fillStyle(0xffffff).fillRect(W / 2 - 320, VIEW_TOP, 640, VIEW_H);
            rowsC.setMask(maskG.createGeometryMask());

            const contentH = this.DEFS.length * ROW_H + 30;
            const minY = Math.min(0, VIEW_H - contentH);
            const onWheel = (pointer, objs, dx, dy) => {
                rowsC.y = Phaser.Math.Clamp(rowsC.y - dy * 0.5, minY, 0);
            };
            scene.input.on('wheel', onWheel);

            if (scene.cameras && scene.cameras.main && scene.uiCam) { try { scene.cameras.main.ignore(items); } catch (e) {} }
            const close = () => {
                this._panelOpen = false;
                try { scene.input.off('wheel', onWheel); } catch (e) {}
                try { maskG.destroy(); } catch (e) {}
                items.forEach(o => { try { o.destroy(); } catch (e) {} });
            };
            dim.on('pointerdown', close);
            closeB.on('pointerdown', close);
            closeB.on('pointerover', () => closeB.setColor('#ff2222'));
            closeB.on('pointerout',  () => closeB.setColor('#ff5555'));
        } catch (e) { this._panelOpen = false; }   // 渲染抛错不卡死开关
    }
};