/**
 * OpeningScene — 游戏开场动画
 * 1) 简单矿洞背景 + 玩家精灵
 * 2) 玩家近战打怪
 * 3) 玩家丢稿子飞过去（钉墙）
 * 4) 玩家钩锁飞过去（zip）
 * 5) 黑屏淡出 → 进入 TitleScene
 *
 * 用简化的物理和纯动画来实现，不复用 GameScene
 */
class OpeningScene extends Phaser.Scene {
    constructor() { super('OpeningScene'); }

    preload() {
        if (typeof AudioSystem !== 'undefined') AudioSystem.loadAll(this);  // 加载全部音频
        this.load.spritesheet('Miner_stand', 'assets/images/Miner_stand.png', { frameWidth: 128, frameHeight: 128 });
        this.load.spritesheet('Miner_run',   'assets/images/Miner_run.png',   { frameWidth: 128, frameHeight: 128 });
        // 重新生成必要的简单纹理
        let g = this.add.graphics();
        // 铁镐
        g.clear().fillStyle(0xffff00).fillRect(0,0,16,16); g.generateTexture('op_pickaxe', 16, 16);
        // 怪物（紫色蜘蛛风格）
        g.clear().fillStyle(0x8800ff).fillRect(0,8,32,16);
        g.fillStyle(0xffffff).fillRect(4,12,4,4).fillRect(24,12,4,4);
        g.generateTexture('op_spider', 32, 32);
        g.destroy();
    }

    create() {
        if (typeof AudioSystem !== 'undefined') AudioSystem.stopBGM();  // BGM
        // 暂时跳过开场动画，直接进 TitleScene
        this.scene.start('TitleScene');
        return;

        const W = this.cameras.main.width;  // 1600
        const H = this.cameras.main.height; // 900

        // 背景：洞穴渐变
        let bg = this.add.graphics();
        bg.fillGradientStyle(0x222244, 0x222244, 0x110a1a, 0x110a1a, 1);
        bg.fillRect(0, 0, W, H);

        // 闪烁水晶背景点
        for (let i = 0; i < 40; i++) {
            this.add.circle(
                Phaser.Math.Between(0, W),
                Phaser.Math.Between(0, H),
                Phaser.Math.Between(1, 3),
                0x88aaff, 0.6
            );
        }

        // 地面
        this.add.rectangle(W / 2, H - 60, W, 120, 0x444466).setStrokeStyle(2, 0x666688);
        // 远处一面墙（用于钩锁演示）
        this.farWall = this.add.rectangle(W - 200, H / 2, 100, 600, 0x555577).setStrokeStyle(2, 0x777799);

        // 标题字
        this.add.text(W / 2, 80, 'ABYSS MINER', {
            fontSize: '52px', color: '#ffffff',
            fontFamily: '"VT323", monospace',
            stroke: '#3344aa', strokeThickness: 4
        }).setOrigin(0.5).setAlpha(0).setName('logo');
        this.tweens.add({ targets: this.children.getByName('logo'), alpha: 1, duration: 1500 });

        // 创建动画
        this.anims.create({ key: 'op_idle', frames: this.anims.generateFrameNumbers('Miner_stand', { start: 0, end: 11 }), frameRate: 12, repeat: -1 });
        this.anims.create({ key: 'op_run',  frames: this.anims.generateFrameNumbers('Miner_run',   { start: 0, end: 5  }), frameRate: 12, repeat: -1 });

        // 玩家
        this.player = this.add.sprite(200, H - 180, 'Miner_stand').play('op_idle');

        // 怪物 1（近战目标）
        this.spider1 = this.add.sprite(450, H - 130, 'op_spider').setScale(1.5);
        // 怪物 2（丢稿目标）
        this.spider2 = this.add.sprite(900, H - 130, 'op_spider').setScale(1.5);
        // 怪物 3（钩锁后击杀）
        this.spider3 = this.add.sprite(W - 280, H - 130, 'op_spider').setScale(1.5);

        // === 顺序执行动画 ===
        this._runSequence();

        // 跳过按钮（右下角，origin 1/1，hitArea 用 (0,0,w,h)）
        let skipTxt = this.add.text(W - 30, H - 30, 'SKIP >', {
            fontSize: '22px', color: '#888888',
            fontFamily: '"VT323", monospace'
        }).setOrigin(1, 1);
        let sw = skipTxt.width, sh = skipTxt.height;
        skipTxt.setInteractive(new Phaser.Geom.Rectangle(0, 0, sw, sh), Phaser.Geom.Rectangle.Contains);
        skipTxt.on('pointerover', () => skipTxt.setColor('#ffff00'));
        skipTxt.on('pointerout',  () => skipTxt.setColor('#888888'));
        skipTxt.on('pointerdown', () => this._goToTitle());

        this.game.canvas.style.cursor = 'url(assets/images/Mouse_cursor.png) 32 32, default';
    }

    _runSequence() {
        // === 动画 1：玩家跑向蜘蛛 1 + 近战击杀 ===
        this.time.delayedCall(800, () => {
            this.player.play('op_run').setFlipX(false);
            this.tweens.add({
                targets: this.player, x: 380, duration: 1200,
                onComplete: () => {
                    this.player.play('op_idle');
                    // 近战范围特效
                    let melee = this.add.graphics();
                    melee.fillStyle(0xffffff, 0.55);
                    melee.fillRect(this.player.x, this.player.y - 40, 100, 80);
                    this.tweens.add({ targets: melee, alpha: 0, duration: 200, onComplete: () => melee.destroy() });
                    // 蜘蛛 1 死亡
                    this.spider1.setTint(0xff0000);
                    this.tweens.add({
                        targets: this.spider1, alpha: 0, y: this.spider1.y - 30, duration: 400,
                        onComplete: () => this.spider1.destroy()
                    });
                    // 进入下一段
                    this.time.delayedCall(800, () => this._sequence2());
                }
            });
        });
    }

    _sequence2() {
        // === 动画 2：玩家丢稿子击中蜘蛛 2 ===
        this.player.play('op_idle');
        // 创建铁镐
        let pickaxe = this.add.image(this.player.x + 30, this.player.y, 'op_pickaxe').setTint(0xffff00).setScale(1.5);
        // 绳索
        let rope = this.add.graphics().setDepth(2);
        let updateRope = () => {
            rope.clear();
            rope.lineStyle(2, 0xffff00, 0.8);
            rope.beginPath();
            rope.moveTo(this.player.x, this.player.y - 10);
            rope.lineTo(pickaxe.x, pickaxe.y);
            rope.strokePath();
        };
        // 飞出去（带旋转）
        this.tweens.add({
            targets: pickaxe,
            x: this.spider2.x, y: this.spider2.y,
            rotation: 8,
            duration: 700,
            onUpdate: updateRope,
            onComplete: () => {
                // 蜘蛛 2 死亡
                this.spider2.setTint(0xff0000);
                this.tweens.add({
                    targets: this.spider2, alpha: 0, y: this.spider2.y - 30, duration: 400,
                    onComplete: () => this.spider2.destroy()
                });
                // 铁镐返回
                this.tweens.add({
                    targets: pickaxe, x: this.player.x, y: this.player.y, rotation: 16,
                    duration: 500, onUpdate: updateRope,
                    onComplete: () => {
                        rope.destroy();
                        pickaxe.destroy();
                        this.time.delayedCall(500, () => this._sequence3());
                    }
                });
            }
        });
    }

    _sequence3() {
        // === 动画 3：玩家钩锁飞向远墙 + 击杀蜘蛛 3 ===
        // 创建铁镐 + 抛出钉墙
        let pickaxe = this.add.image(this.player.x + 30, this.player.y, 'op_pickaxe').setTint(0xffff00).setScale(1.5);
        let rope = this.add.graphics().setDepth(2);
        let updateRope = () => {
            rope.clear();
            rope.lineStyle(2, 0xffff00, 0.8);
            rope.beginPath();
            rope.moveTo(this.player.x, this.player.y - 10);
            rope.lineTo(pickaxe.x, pickaxe.y);
            rope.strokePath();
        };
        // 抛向远墙
        let wallX = this.farWall.x - 50;
        let wallY = this.player.y - 150;
        this.tweens.add({
            targets: pickaxe, x: wallX, y: wallY, rotation: 6,
            duration: 600,
            onUpdate: updateRope,
            onComplete: () => {
                // 钉住停顿一下
                pickaxe.setTint(0xffaa00);
                this.time.delayedCall(300, () => {
                    // 玩家飞过去
                    this.player.play('op_run');
                    this.tweens.add({
                        targets: this.player,
                        x: wallX - 60, y: wallY + 30,
                        duration: 500,
                        onUpdate: updateRope,
                        onComplete: () => {
                            this.player.play('op_idle').setFlipX(false);
                            rope.destroy();
                            pickaxe.destroy();
                            // 落地砸死 spider3
                            this.spider3.setTint(0xff0000);
                            let melee = this.add.graphics();
                            melee.fillStyle(0xffffff, 0.55);
                            melee.fillRect(this.player.x, this.player.y - 40, 120, 80);
                            this.tweens.add({ targets: melee, alpha: 0, duration: 200, onComplete: () => melee.destroy() });
                            this.tweens.add({
                                targets: this.spider3, alpha: 0, y: this.spider3.y - 30, duration: 400,
                                onComplete: () => this.spider3.destroy()
                            });
                            // 黑屏淡出
                            this.time.delayedCall(800, () => this._fadeToTitle());
                        }
                    });
                });
            }
        });
    }

    _fadeToTitle() {
        const W = this.cameras.main.width;
        const H = this.cameras.main.height;
        let fade = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(1000);
        this.tweens.add({
            targets: fade, alpha: 1, duration: 1500,
            onComplete: () => this._goToTitle()
        });
    }

    _goToTitle() {
        this.scene.start('TitleScene');
    }
}