/**
 * OpeningScene — 开局大标题
 * 第一次打开游戏: 黑屏 → 屏幕中央播放 Big_title 动画(37帧) → 停在最后一帧 1 秒 → 进入 TitleScene
 * preload 同时负责加载全部游戏音频 (AudioSystem.loadAll)
 *
 * (用户) 原单张 Big_title.png = 29600×400(37帧×800) 超显卡贴图上限(16384px) → 传不上去标题空白.
 *   改为拆成两张 Big_title1 / Big_title2 (每张仍每帧 800×400), 两张的帧拼接成一个动画连续播.
 */
class OpeningScene extends Phaser.Scene {
    constructor() { super('OpeningScene'); }

    preload() {
        if (typeof AudioSystem !== 'undefined') AudioSystem.loadAll(this);   // 加载全部音频
        // (用户) 大标题拆两张, 每帧 800×400
        this.load.spritesheet('Big_title1', 'assets/images/Big_title1.png', { frameWidth: 800, frameHeight: 400 });
        this.load.spritesheet('Big_title2', 'assets/images/Big_title2.png', { frameWidth: 800, frameHeight: 400 });
        // 诊断: 加载失败 → 控制台明确提示
        this.load.on('loaderror', (file) => {
            if (file && (file.key === 'Big_title1' || file.key === 'Big_title2'))
                console.warn('[Opening] ' + file.key + '.png 加载失败! 检查: (1) 文件在 assets/images/' + file.key + '.png (2) 文件名拼写/大小写一致 (3) 每帧 800×400, 单张宽度 <16384px');
        });
        // (用户) Big_title 在本场景二次加载几秒 — 让统一加载层显示这段进度 (否则停在 BootScene 的 "Building world... 100%")
        if (window.AzmLoading) {
            window.AzmLoading.setLabel('Loading title...');
            window.AzmLoading.setProgress(0);
            this.load.on('progress', (p) => { if (window.AzmLoading) window.AzmLoading.setProgress(p); });
        }
    }

    create() {
        if (typeof AudioSystem !== 'undefined') AudioSystem.stopBGM();
        const cam = this.cameras.main;
        const sw = cam.width, sh = cam.height;
        cam.setBackgroundColor('#000000');
        this.add.rectangle(sw / 2, sh / 2, sw, sh, 0x000000).setDepth(0);   // 兜底黑底
        // (用户修复) 关键: 隐藏统一加载层 — 它是 z-index 9999 的黑色 DOM 覆盖层, 不 hide 会盖住 canvas 里的 Big_title (原本拖到 TitleScene 才 hide → 标题全程被挡看不见)
        if (window.AzmLoading) window.AzmLoading.hide();

        const goTitle = () => { try { this.scene.start('TitleScene'); } catch (e) {} };

        // 缺图兜底: 至少要有 Big_title1, 否则直接进 TitleScene 不卡开机
        const has1 = this.textures.exists('Big_title1');
        const has2 = this.textures.exists('Big_title2');
        if (!has1) {
            console.warn('[Opening] 找不到 Big_title1 贴图 → 直接进 Title。请把拆好的 Big_title1.png / Big_title2.png 放进 assets/images/ (每帧 800×400)');
            goTitle(); return;
        }

        const ft1 = this.textures.get('Big_title1').frameTotal;
        const ft2 = has2 ? this.textures.get('Big_title2').frameTotal : 0;
        // (用户修复) frameTotal 含 1 个 __BASE 帧(整张图当一帧) → 实际精灵帧数 = frameTotal - 1
        const a1 = Math.max(0, ft1 - 1);
        const a2 = Math.max(0, ft2 - 1);
        console.log('[Opening] Big_title1 帧数 =', a1, '/ Big_title2 帧数 =', a2, '(frameTotal', ft1, '/', ft2, ', 已减 __BASE) — 合计', a1 + a2, '帧');
        // 诊断: 单张仍过宽则贴图上传会失败(空白)
        try {
            ['Big_title1', 'Big_title2'].forEach((k) => {
                if (!this.textures.exists(k)) return;
                const _src = this.textures.get(k).getSourceImage();
                const _w = _src && (_src.width || _src.naturalWidth);
                if (_w && _w > 16384) console.warn('[Opening] ' + k + ' 宽 ' + _w + 'px 仍超显卡上限 16384 → 标题会空白! 再拆细一点或缩小每帧。');
            });
        } catch (e) {}

        // (用户) 把两张的帧拼成一个动画连续播; 内容总帧数封顶 37 (防某张有补白尾帧)
        if (!this.anims.exists('big_title_intro')) {
            try {
                const TOTAL = 37;
                const n1 = Math.min(a1, TOTAL);
                const n2 = Math.max(0, Math.min(a2, TOTAL - n1));
                let frames = n1 > 0 ? this.anims.generateFrameNumbers('Big_title1', { start: 0, end: n1 - 1 }) : [];
                if (n2 > 0) frames = frames.concat(this.anims.generateFrameNumbers('Big_title2', { start: 0, end: n2 - 1 }));
                this.anims.create({ key: 'big_title_intro', frames: frames, frameRate: 18, repeat: 0 });
            } catch (e) {}
        }

        const intro = this.add.sprite(sw / 2, sh / 2, 'Big_title1').setOrigin(0.5).setDepth(10);
        intro.setScale(Math.min(sw / 800, sh / 400) * 0.9);   // 等比适配进屏 (原始帧 800×400)

        const anim = this.anims.exists('big_title_intro') ? this.anims.get('big_title_intro') : null;
        const frameCount = anim && anim.frames ? anim.frames.length : 0;
        if (anim && frameCount > 0) {
            intro.play('big_title_intro');
            if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this, 'BigTitle');   // (用户) BigTitle 动画播放时播 1 次
            intro.once('animationcomplete-big_title_intro', () => this.time.delayedCall(1000, goTitle));   // 播完停最后一帧 1 秒再进
            const animMs = (frameCount / 18) * 1000 + 1500;   // 兜底: 完成事件没触发(切后台等)也强制进
            this.time.delayedCall(animMs, goTitle);
        } else {
            this.time.delayedCall(1000, goTitle);   // 动画建失败 → 显示首帧 1 秒后进
        }
    }
}