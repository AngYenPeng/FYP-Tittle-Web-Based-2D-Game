/**
 * OpeningScene — 开局大标题
 * 第一次打开游戏: 黑屏 → 屏幕中央播放 Big_title 动画(37帧) → 停在最后一帧 1 秒 → 进入 TitleScene
 * preload 同时负责加载全部游戏音频 (AudioSystem.loadAll)
 */
class OpeningScene extends Phaser.Scene {
    constructor() { super('OpeningScene'); }

    preload() {
        if (typeof AudioSystem !== 'undefined') AudioSystem.loadAll(this);   // 加载全部音频
        this.load.spritesheet('Big_title', 'assets/images/Big_title.png', { frameWidth: 800, frameHeight: 400 });   // (用户) 开局大标题 29600×400 / 37 帧 → 每帧 800×400
        // (用户) 诊断: 加载失败 → 控制台明确提示 (文件名是 Big_title, 不是 Big_tittle)
        this.load.once('loaderror', (file) => {
            if (file && file.key === 'Big_title') console.warn('[Opening] Big_title.png 加载失败! 检查: (1) 文件在 assets/images/Big_title.png (2) 文件名拼写=Big_title (不是 tittle / 大小写不符) (3) 图为 29600×400');
        });
    }

    create() {
        if (typeof AudioSystem !== 'undefined') AudioSystem.stopBGM();
        const cam = this.cameras.main;
        const sw = cam.width, sh = cam.height;
        cam.setBackgroundColor('#000000');
        this.add.rectangle(sw / 2, sh / 2, sw, sh, 0x000000).setDepth(0);   // 兜底黑底

        const goTitle = () => { try { this.scene.start('TitleScene'); } catch (e) {} };

        // 缺图兜底: 直接进 TitleScene, 不卡开机
        if (!this.textures.exists('Big_title')) {
            console.warn('[Opening] 找不到 Big_title 贴图 → 直接进 Title。请把 29600×400 的 Big_title.png 放进 assets/images/ (文件名拼写: Big_title)');
            goTitle(); return;
        }
        console.log('[Opening] Big_title 已加载, frameTotal =', this.textures.get('Big_title').frameTotal, '— 37 帧时应为 38; 若为 2 则说明尺寸/frameWidth(800) 与实际图不符, 只切出 1 帧');
        // (用户) 诊断: 单行 37×800=29600px 超显卡贴图上限(通常16384) → texImage2D out of range → 标题空白. 需重导成网格(每边<4096最稳, 如5列×8行=4000×3200)
        try {
            const _src = this.textures.get('Big_title').getSourceImage();
            const _w = _src && (_src.width || _src.naturalWidth), _h = _src && (_src.height || _src.naturalHeight);
            if (_w && _w > 16384) console.warn('[Opening] Big_title 宽 ' + _w + 'px 超过显卡上限 16384 → 贴图上传失败, 标题会空白! 请把图重导成网格 (每帧仍 800×400, 排成多行, 如 5列×8行=4000×3200, 37帧按从左到右从上到下顺序 + 3个空白补满 40 格)。');
        } catch (e) {}

        // 用点现注册 big_title_intro (帧数随贴图自适应, 不复用各场景注册簇)
        if (!this.anims.exists('big_title_intro')) {
            try {
                const ft = this.textures.get('Big_title').frameTotal;
                // (用户) 固定播 37 帧 (0~36): 重导成网格后即使多了空白补格(如5×8=40格,3个空白)也只播内容帧; ft 不足时按实际封顶
                this.anims.create({ key: 'big_title_intro', frames: this.anims.generateFrameNumbers('Big_title', { start: 0, end: Math.min(36, Math.max(0, ft - 1)) }), frameRate: 18, repeat: 0 });
            } catch (e) {}
        }

        const intro = this.add.sprite(sw / 2, sh / 2, 'Big_title').setOrigin(0.5).setDepth(10);
        intro.setScale(Math.min(sw / 800, sh / 400) * 0.9);   // 等比适配进屏 (原始帧 800×400)

        if (this.anims.exists('big_title_intro')) {
            intro.play('big_title_intro');
            intro.once('animationcomplete-big_title_intro', () => this.time.delayedCall(1000, goTitle));   // 播完停最后一帧 1 秒再进
            const animMs = (this.textures.get('Big_title').frameTotal / 18) * 1000 + 1500;   // 兜底: 完成事件没触发(切后台等)也强制进
            this.time.delayedCall(animMs, goTitle);
        } else {
            this.time.delayedCall(1000, goTitle);   // 动画建失败 → 显示首帧 1 秒后进
        }
    }
}