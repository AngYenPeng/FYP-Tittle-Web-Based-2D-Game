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
    }

    create() {
        if (typeof AudioSystem !== 'undefined') AudioSystem.stopBGM();
        const cam = this.cameras.main;
        const sw = cam.width, sh = cam.height;
        cam.setBackgroundColor('#000000');
        this.add.rectangle(sw / 2, sh / 2, sw, sh, 0x000000).setDepth(0);   // 兜底黑底

        const goTitle = () => { try { this.scene.start('TitleScene'); } catch (e) {} };

        // 缺图兜底: 直接进 TitleScene, 不卡开机
        if (!this.textures.exists('Big_title')) { goTitle(); return; }

        // 用点现注册 big_title_intro (帧数随贴图自适应, 不复用各场景注册簇)
        if (!this.anims.exists('big_title_intro')) {
            try {
                const ft = this.textures.get('Big_title').frameTotal;
                this.anims.create({ key: 'big_title_intro', frames: this.anims.generateFrameNumbers('Big_title', { start: 0, end: Math.max(0, ft - 2) }), frameRate: 18, repeat: 0 });
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