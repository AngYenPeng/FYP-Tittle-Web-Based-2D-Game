var sz5_bossBarrier, sz5_merchant, sz5_arenaLocked = false;
// (合并) 自建对话框元素已移除, 统一用项目 DialogSystem 渲染
var sz5_dialogueState = 0;
var sz5_currentLine = 0;
var sz5_hazards;
var sz5_bullets;
var sz5_spawnDoor, sz5_bossDoor;
var sz5_exitWall, sz5_exitStairs, sz5_victoryTrigger;
var sz5_bossBeatenSequence = false;
var sz5_roarAlertTriggered = false; // 🌟 新增：防止半路咆哮对话每帧重复触发
var sz5_dialogueLines = [
"Merchant: Oi, dirt-scratcher. Didn't peg ya to survive this deep... gotta hand it to ya, you got grit.",
"Merchant: 'Fore you go kickin' the hornet's nest, listen up. Them shiny blue rocks you been hoarding? They sprout by suckin' the juice outta the dead down here.",
"Merchant: I ain't buyin' 'em to get filthy rich. I'm baggin' the infection. Every rock I pocket is one less nasty bug crawlin' its way to the topside.",
"Merchant: The Big Bad is right through there. The Mother of all this mess. Go on, give 'er hell and finish this."
];
// File: SafeZone5Scene.js at the top, along with existing globals
var sz5_reliefDialogueLines = [ // New lines reflecting relief
    "Merchant: It's... over. Finally, some quiet down here.",
    "Merchant: This old place is looking better by the minute. You really cleaned house.",
    "Merchant: No more bug counting for me, for a while at least.",
    "Merchant: Well, don't just stand there with your pickaxes. There's a proper quiet surface waiting for you."
];
var sz5_currentReliefLine = 0; // Tracks the current line of the relief dialogue
var sz5_terrain = [
[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
[1,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
[1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0],
[1,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,1],
[1,0,0,1,1,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,1],
[1,1,1,1,1,1,1,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,1,1,1],
[1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,1,1,1,1,1],
[1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,1,1,1,1,1,1,1],
[1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1],
[1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1],
[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1],
[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1],
[1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1],
[1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,2,2,2,1,1,1,1,1,1,1,1,1,2,2,2,2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
]
/**
 * SafeZone5Scene — 5 号安全区 (占位框架)
 *
 * 提前搭好的空壳, 复制自 SZ2 但删了所有非 spawn 地形 + boss + 实体.
 * 之后要做 SZ5 内容直接在 _applyLevelData 里加.
 */
class SafeZone5Scene extends MainGameScene {

    // 🌟 UNIQUE FIX: Defined dialogue closing helper to turn movement controls back on safely
    // (合并) 把 "Speaker: text" 台词转成 DialogSystem 的 entry 格式
    _sz5DialogEntry(line) {
        const i = line.indexOf(': ');
        return (i > 0) ? { speaker: line.slice(0, i), text: line.slice(i + 2) } : { speaker: '', text: line };
    }

    // 释怀对白播完: 置 state 8 + 镜头拉回探索缩放 2.5 并跟随 (出口判定依赖 state===8)
    finishReliefDialogue() {
        sz5_dialogueState = 8;
        this.playerCanMove = true;
        this.cameras.main.zoomTo(2.5, 1200, 'Sine.easeInOut');
        this.cameras.main.startFollow(this.player, true, 0.05, 0.05);
    }

    // 通关后商人释怀对白: 镜头特写 3.4 → DialogSystem 播台词 → 播完回调 finishReliefDialogue
    setupMerchantFinalDialogue() {
        this._readyForReliefDialogue = true;   // 出口判定 (update 内 x>2920) 依赖此标记
        sz5_dialogueState = 1;
        this.playerCanMove = false;
        if (this.player.body) this.player.body.setVelocity(0, 0);

        this.cameras.main.stopFollow();
        this.cameras.main.pan(sz5_merchant.x, sz5_merchant.y - 15, 800, 'Cubic.easeInOut');
        this.cameras.main.zoomTo(3.4, 800, 'Cubic.easeInOut');

        if (this.dialogSystem) {
            this.dialogSystem.showSequence(
                sz5_reliefDialogueLines.map(l => this._sz5DialogEntry(l)),
                () => this.finishReliefDialogue()
            );
        } else { this.finishReliefDialogue(); }
    }

revealEndgamePassage() {
        console.log("Boss beaten! Activating total tileset mapping purification sequence.");
        if (this.finalHint) this.finalHint.destroy();

        const cam = this.cameras.main;
        cam.stopFollow(); 

        cam.setBounds(1440, 120, 1760, 580); 
        cam.pan(sz5_exitWall.x, sz5_exitWall.y, 1000, 'Cubic.easeInOut');
        cam.zoomTo(3.2, 1000, 'Cubic.easeInOut');

        this.time.delayedCall(1100, () => {
            this.tweens.add({
                targets: sz5_exitWall,
                x: '+=6',
                duration: 50,
                yoyo: true,
                repeat: 10,
                onComplete: () => {
                    this.sound.play('snd_boss_explode', { volume: 0.9 });
                    cam.flash(600, 255, 255, 255); 
                    cam.shake(500, 0.04);          

                    let originX = sz5_exitWall.x;
                    let originY = sz5_exitWall.y;

                    if (sz5_exitWall) sz5_exitWall.destroy(); 

                    if (sz5_exitStairs) {
                        sz5_exitStairs.getChildren().forEach(step => {
                            step.setVisible(true);
                            if (step.body) step.body.enable = true;
                        });
                    }

                    // 🌟 开启全图集高级映射纯净转化
                    let flashWave = this.add.circle(originX, originY, 10, 0xffcc44, 0.4).setDepth(20);
                    this.tweens.add({
                        targets: flashWave,
                        radius: 3500,
                        duration: 1400,
                        ease: 'Quad.easeOut',
                        onUpdate: () => {
                            let currentRadius = flashWave.radius;

                            // A. 无缝更换背景图层
                            if (this.bg && this.bg.setTexture) {
                                this.bg.setTexture('Yellow_bg');
                                this.bg.clearTint(); 
                            }

                            // B. 智能分层结构算法
                            if (this.walls && this.walls.getChildren) {
                                this.walls.getChildren().forEach(w => {
                                    if (Phaser.Math.Distance.Between(w.x, w.y, originX, originY) < currentRadius && w.texture) {
                                        
                                        let currentKey = w.texture.key;
                                        // 🌟 核心修复：在这里优先将 blockRow 声明计算出来！使其在所有后续的 else if 判断里都完全可用！
                                        let blockRow = Math.floor(w.y / 32); 

                                        // 1. 如果原本是地表层地板 (tile_floor) -> 更换为带有绿草皮的草地边缘
                                        if (currentKey === 'tile_floor') {
                                            w.setTexture('Yellow_dirt_T');
                                        } 
                                        // 2. 如果本来是带地形边缘特征的复杂复合皮肤 (比如 Cavetile_wall_2L, Cavetile_wall_TRB 等)
                                        else if (currentKey.includes('Cavetile_wall_')) {
                                            let suffix = currentKey.split('Cavetile_wall_')[1];
                                            
                                            if (suffix === '2L') {
                                                w.setTexture('Yellow_dirt_L');
                                            } else if (suffix.startsWith('T')) {
                                                w.setTexture('Yellow_dirt_T');
                                            } else {
                                                let mappedKey = 'Yellow_dirt_' + suffix;
                                                // 🌟 缓存卫士保护：检查图片是否存在，防止缺失某些图（如 B.png 404）导致游戏闪退
                                                if (this.textures.exists(mappedKey)) {
                                                    w.setTexture(mappedKey);
                                                } else {
                                                    w.setTexture('Yellow_dirt_3L2'); // 找不到特定图时以此图安全兜底
                                                }
                                            }
                                        }
                                        // 3. 如果是普通的内部实心方块 (tile_wall) -> 进行三层宏观生态分层
                                        else if (currentKey === 'tile_wall') {
                                            if (blockRow <= 4) {
                                                // 靠近顶部的层：使用左边缘普通泥土混合
                                                w.setTexture('Yellow_dirt_L');
                                            }
                                            else if (blockRow >= 5 && blockRow <= 13) {
                                                // 中层普通黄泥土内壁：混合错开使用 3L1, 3L2, 3L3 和 3LC 等带有杂草、砂石碎屑点缀的高细节块
                                                let variations = ['Yellow_dirt_3L1', 'Yellow_dirt_3L2', 'Yellow_dirt_3L3', 'Yellow_dirt_3LC1', 'Yellow_dirt_3LC2', 'Yellow_dirt_3LC3'];
                                                let choice = variations[(blockRow + Math.floor(w.x / 32)) % variations.length];
                                                w.setTexture(choice);
                                            }
                                            else if (blockRow >= 14) {
                                                // 🌟 最深处地底（Row 14 及以下）：全部爆发替换为长满金黄色璀璨晶体的发光矿脉图（5LC1, 5LC2, 5LC3）！
                                                let crystalVariations = ['Yellow_dirt_5LC1', 'Yellow_dirt_5LC2', 'Yellow_dirt_5LC3'];
                                                let crystalChoice = crystalVariations[(blockRow + Math.floor(w.x / 32)) % crystalVariations.length];
                                                w.setTexture(crystalChoice);
                                            }
                                        }
                                    }
                                });
                            }
                        },
                        onComplete: () => {
                            flashWave.destroy();

<<<<<<< HEAD
                            // 商人钻出：高度和位置经过了像素重构，完美贴合你调好的新台阶孔位
                            if (sz5_merchant) {
                                let startY = originY + 160;  // 藏在更深的地下
                                let endY = originY - 60;    // 最终完美双脚踩在 Row 14 梯口的地表平线上！

                                sz5_merchant.setPosition(originX - 120, startY); 
                                sz5_merchant.setVisible(true);
                                sz5_merchant.setAlpha(0);
                                sz5_merchant.setFlipX(true); // 脸朝左迎接走过来的玩家
=======
                            // 老鼠商人破土而出效果
                            if (sz6_merchant) {
                                let startY = originY + 160; 
                                let endY = originY - 30;   

                                sz6_merchant.setPosition(originX - 120, startY); 
                                sz6_merchant.setVisible(true);
                                sz6_merchant.setAlpha(0);
                                sz6_merchant.setFlipX(true); 
>>>>>>> d125d30913f6f4a6de6ed7bd79aeefb9ac8f8741

                                this.tweens.add({
                                    targets: sz5_merchant,
                                    y: endY,        
                                    alpha: 1,
                                    duration: 1000,
                                    ease: 'Back.easeOut',
                                    onComplete: () => {
                                        this.physics.add.existing(sz5_merchant, true);
                                        if (sz5_merchant.body && sz5_merchant.body.updateFromGameObject) {
                                            sz5_merchant.body.updateFromGameObject();
                                        }
                                        this.setupMerchantFinalDialogue(); 
                                    }
                                });
                            }
                        }
                    });
                }
            });
        });
    }

    // 真稿子系统 — 直接定义在场景内 (不依赖 GameScene.js)

    // handlePickCollide 内置 (保底, 不靠继承 GameScene)
    handlePickCollide(pick, id) {
        if (!pick.body) return;
        let dtk = id === 1 ? 'dropTimer1' : 'dropTimer2';
        if (pick.state==='flying_max' || pick.state==='flying_gravity' || pick.state==='dropping') {
            // (用户) 穿墙修正: 高速下 arcade 分离可能把稿子推到墙另一侧(视觉穿墙), 之后绳子拉断才被强制收回.
            // 钉墙前先沿来路(绳子路线)回溯: 上一帧好位置→当前位置 线段扫掠(含空气墙), 命中就拉回墙的近侧表面再钉.
            if (pick._lastCX !== undefined) {
                const bcx = pick.body.center.x, bcy = pick.body.center.y;
                if (Math.hypot(bcx - pick._lastCX, bcy - pick._lastCY) <= 400) {   // 异常长段(传送等)不回溯
                    let wl = this.wallRects;
                    if (this._pickExtraWalls && this._pickExtraWalls.length) {
                        wl = wl.concat(this._pickExtraWalls.filter(w => w && w.body).map(w => w.body));
                    }
                    const bk = CollisionUtils.sweptSegmentVsWalls(pick._lastCX, pick._lastCY, bcx, bcy, wl, 6);
                    if (bk.hit) { pick.body.reset(bk.x, bk.y); pick.x = bk.x; pick.y = bk.y; }
                }
            }
            CollisionUtils.resolvePickWallCollision(pick, this.wallRects);
            // 没有轻重之分了 — 打到墙一律钉住 (不收回)
            pick.state = 'attached'; pick.justAttached = true; pick.ignoreZipFrames = 15;
            pick.body.setVelocity(0,0); pick.body.setAllowGravity(false); pick.clearTint();
            if (this[dtk]) { this[dtk].remove(); this[dtk] = null; }
        }
    }

    _setupRealPickaxes() {
        this.inv = { left: true, right: true };
        this.pick1 = new Pickaxe(this, 0, 0);
        this.pick2 = new Pickaxe(this, 0, 0);
        this.pick1.setCollideWorldBounds(true);
        this.pick2.setCollideWorldBounds(true);
        this.physics.add.collider(this.pick1, this.walls, () => this.handlePickCollide(this.pick1, 1));
        this.physics.add.collider(this.pick2, this.walls, () => this.handlePickCollide(this.pick2, 2));
        // 🌟 核心修复：建立飞镐对 Boss 伤害的实时重叠监听器
    // 获取当前被砸中的真实 Boss 实例
    let boss = BossManager.entity;
    if (!boss || !boss.active || boss.isDead || boss.isReviving) return;

    // 只有当稿子正处于被丢出去的攻击飞行、掉落状态时，才计算伤害
    if (pick.state === 'flying_max' || pick.state === 'flying_gravity' || pick.state === 'dropping') {
        
        // 1. 让 Boss 受到 1 点近战稿击伤害
        boss.takeDamage(1); 
        
        // 2. 触发关卡摄像机轻微受击震动，增强打击感
        this.cameras.main.shake(200, 0.015);
        
        // 3. 强制把被弹飞的稿子收回（Recall），防止它穿透 Boss 身体
        this.recallSystem.startRecall(pick); 
    }

        // (用户) 已登记的空气墙 → 稿子碰撞器 (空气墙对稿子 = 真墙; 处理"墙先建/稿子后建"的顺序)
        if (this._pickExtraWalls) this._pickExtraWalls.forEach(w => this._addPickWallCollider(w));
        this.ropeNodes1 = []; this.ropeNodes2 = [];
        for (let i = 0; i < 15; i++) {
            this.ropeNodes1.push({x:0,y:0,ox:0,oy:0});
            this.ropeNodes2.push({x:0,y:0,ox:0,oy:0});
        }
        this.physics.add.overlap(this.player, [this.pick1, this.pick2], (p, pick) => {
            if (pick.state === 'dropped' || pick.state === 'returning') this.recallSystem.doCollect(pick);
        });
        if (!this.ropeGraphics) {
            this.ropeGraphics = this.add.graphics().setDepth(650);
            if (this.uiCam) { try { this.uiCam.ignore(this.ropeGraphics); } catch(e) {} }
        }
    }

    _updateRealPickaxes(time, delta) {
        if (!this.pick1 || !this.pick1.body) return;
        if (!this.ropeGraphics) return;
        this.ropeGraphics.clear();
        [this.pick1, this.pick2].forEach((p, index) => {
            if (!p.body) return;
            // CCD 防穿墙: 飞行中扫掠这帧 body 移动线, 穿过墙(含空气墙)就回溯钉在墙面
            if ((p.state === 'flying_max' || p.state === 'flying_gravity' || p.state === 'dropping') && this._sweepPickToWall(p)) {
                this.handlePickCollide(p, index === 0 ? 1 : 2);
            }
            let limit = p.isHeavy ? this.HEAVY_FLY_LIMIT : this.WARNING_DISTANCE;
            let rk  = index === 0 ? 'ropeLength1' : 'ropeLength2';
            let dtk = index === 0 ? 'dropTimer1'  : 'dropTimer2';
            let rtk = index === 0 ? 'retractTimer1' : 'retractTimer2';
            let nodes = index === 0 ? this.ropeNodes1 : this.ropeNodes2;
            let aS = index === 0 ? this.activeStart1 : this.activeStart2;
            let aE = index === 0 ? this.activeEnd1   : this.activeEnd2;
            let iPR = p.state === 'pre_returning', iPZ = p.state === 'pre_zipping';
            let iR = p.state === 'returning', iZ = this.isGrappling && this.activeGrapplePick === p;
            let sd = Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y);

            if (iPR || iPZ) {
                this[rk] = Math.max(sd, this[rk] - 45000 * (delta/1000));
            } else if (iR || iZ) {
                this[rk] = this.ropePhysics.calculateActualRopeLength(p, aS, aE);
            } else {
                if (p.state === 'attached' || p.state === 'dropping') {
                    let ad = Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y);
                    if (ad > this[rk]) this[rk] = ad;
                    else if (p.state === 'attached') this[rk] = Math.max(ad, this[rk] - 2000 * (delta/1000));
                }
                if ((p.state === 'flying_max' || p.state === 'flying_gravity') && sd > limit) {
                    p.state = 'dropping'; this[rk] = limit; p.body.setAllowGravity(true);
                    p.body.velocity.x *= 0.3; if (p.body.velocity.y < 0) p.body.velocity.y = 0;
                    p.hasBounced = false;
                    this[dtk] = this.time.delayedCall(p.isHeavy ? 3000 : 500, () => {
                        if (p.state === 'dropping' || (p.isHeavy && p.state === 'attached')) this.recallSystem.startRecall(p);
                    });
                }
                if (p.state === 'dropping') {
                    let al = this.ropePhysics.calculateActualRopeLength(p, aS, aE);
                    if (al > limit) {
                        let ax = aS <= aE ? nodes[aE].x : this.player.x;
                        let ay = aS <= aE ? nodes[aE].y : this.player.y;
                        let pa = Phaser.Math.Angle.Between(ax, ay, p.x, p.y);
                        let ov = Math.min(al - limit, Phaser.Math.Distance.Between(ax, ay, p.x, p.y) * 0.8);
                        p.x -= Math.cos(pa) * ov * 0.2; p.y -= Math.sin(pa) * ov * 0.2;
                        let dot = p.body.velocity.x * Math.cos(pa) + p.body.velocity.y * Math.sin(pa);
                        if (dot > 0) { p.body.velocity.x -= dot * Math.cos(pa); p.body.velocity.y -= dot * Math.sin(pa); }
                        p.body.velocity.x *= 0.99; p.body.velocity.y *= 0.99;
                    }
                }
            }

            let ms = this.ropePhysics.processVerletRope(p, index);
            if (!iZ && !iPZ) {
                if (ms > 30 && p.state !== 'idle' && p.state !== 'returning') this.recallSystem.startRecall(p, true);
                if (p.state === 'attached') {
                    let al = this.ropePhysics.calculateActualRopeLength(p, aS, aE);
                    if (p.ignoreZipFrames && p.ignoreZipFrames > 0) {
                        p.ignoreZipFrames--;
                    } else {
                        let ws = this.WARNING_DISTANCE / 16, cs = this.CRITICAL_DISTANCE / 16;
                        if (ms > cs && al > this.CRITICAL_DISTANCE * 0.8 && sd > this.CRITICAL_DISTANCE * 0.4)
                            this.recallSystem.startRecall(p);
                        else if (ms > ws && al > this.WARNING_DISTANCE * 0.8 && sd > this.WARNING_DISTANCE * 0.4) {
                            p.setTint(0xff0000);
                            if (!this[rtk]) this[rtk] = this.time.delayedCall(this.RETRACT_DELAY, () => {
                                if (p.state === 'attached') this.recallSystem.startRecall(p);
                                this[rtk] = null;
                            });
                        } else { p.clearTint(); if (this[rtk]) { this[rtk].remove(); this[rtk] = null; } }
                    }
                } else if (p.state === 'dropping') {
                    if (ms > this.WARNING_DISTANCE / 16) p.setTint(0xff0000); else p.clearTint();
                }
            } else { p.clearTint(); }
        });

        this.grappleSystem.update();
        this.recallSystem.update();
        this.throwSystem.updateUI();

    
    }


    constructor() {
        super();
        Phaser.Scene.call(this, { key: 'SafeZone5Scene' });
    }

    init(data) {
        this._inheritedData = data || {};
    }

    preload() {
    if (typeof super.preload === 'function') super.preload();

        // 🌟 存档点资产载入：将图片资源注册进 Phaser 缓存注册表
        this.load.image('Checkpoint_unactivated', 'assets/images/Checkpoint_unactivated.png');
        this.load.image('Checkpoint_activating', 'assets/images/Checkpoint_activating.png');
        this.load.image('Checkpoint_activated', 'assets/images/Checkpoint_activated.png');

        // --- 1. 核心黄色净化瓦片集 (Tileset) 完整注册引入 ---
        // 基础地层结构（直线边缘）
        this.load.image('Yellow_dirt_T', 'assets/images/Yellow_dirt_T.png');     // 顶部地表草皮
        this.load.image('Yellow_dirt_B', 'assets/images/Yellow_dirt_B.png');     // 底部边缘
        this.load.image('Yellow_dirt_L', 'assets/images/Yellow_dirt_2L.png');    // 左侧墙面（对应你的 2L）
        this.load.image('Yellow_dirt_R', 'assets/images/Yellow_dirt_3L1.png');   // 右侧墙面（对应你的 3L1）
        
        // 复杂双面、三面、全包围边缘（从你的项目截图目录精准提取）
        this.load.image('Yellow_dirt_TB', 'assets/images/Yellow_dirt_TB.png');
        this.load.image('Yellow_dirt_TR', 'assets/images/Yellow_dirt_TR.png');
        this.load.image('Yellow_dirt_TRB', 'assets/images/Yellow_dirt_TRB.png');
        this.load.image('Yellow_dirt_TRBL', 'assets/images/Yellow_dirt_TRBL.png');
        
        // 各种深度和细节差异的中心实心内瓦片
        this.load.image('Yellow_dirt_3L1', 'assets/images/Yellow_dirt_3L1.png');
        this.load.image('Yellow_dirt_3L2', 'assets/images/Yellow_dirt_3L2.png');
        this.load.image('Yellow_dirt_3L3', 'assets/images/Yellow_dirt_3L3.png');
        this.load.image('Yellow_dirt_3LC1', 'assets/images/Yellow_dirt_3LC1.png');
        this.load.image('Yellow_dirt_3LC2', 'assets/images/Yellow_dirt_3LC2.png');
        this.load.image('Yellow_dirt_3LC3', 'assets/images/Yellow_dirt_3LC3.png');
        
        // 🌟 晶体深层（带黄色水晶颗粒的 5L 系列）
        this.load.image('Yellow_dirt_5LC1', 'assets/images/Yellow_dirt_5LC1.png');
        this.load.image('Yellow_dirt_5LC2', 'assets/images/Yellow_dirt_5LC2.png');
        this.load.image('Yellow_dirt_5LC3', 'assets/images/Yellow_dirt_5LC3.png');

        this.load.image('Yellow_bg', 'assets/images/Yellow_dirt_3L2.png')

    // 1. 背景音乐 (BGM)
    this.load.audio('bgm_safezone5', 'assets/audio/BGM/SafeZone5_Ambient.mp3'); // 关卡探索BGM
    this.load.audio('bgm_spider_boss', 'assets/audio/BGM/SpiderBoss_Theme.mp3'); // Boss战激昂BGM

    // 2. Boss 动作与受击音效
    this.load.audio('snd_boss_roar', 'assets/audio/SpiderBoss/Spider_Roar.mp3');     // 开场咆哮
    this.load.audio('snd_boss_hurt', 'assets/audio/SpiderBoss/Spider_Hurt.mp3');     // Boss受击
    this.load.audio('snd_boss_dead', 'assets/audio/SpiderBoss/Spider_Dead.mp3');     // Boss死亡
    this.load.audio('snd_boss_explode', 'assets/audio/SpiderBoss/Spider_Explode.mp3');// 最终爆炸

    // 3. Boss 技能与攻击音效
    this.load.audio('snd_web_shoot', 'assets/audio/SpiderBoss/Web_Shoot.mp3');       // 吐蛛网 / 轰炸
    this.load.audio('snd_boss_dash', 'assets/audio/SpiderBoss/Spider_Dash.mp3');     // 疯狂冲锋
    this.load.audio('snd_venom_spit', 'assets/audio/SpiderBoss/Venom_Spit.mp3');     // 吐毒液
    this.load.audio('snd_egg_lay', 'assets/audio/SpiderBoss/Egg_Lay.mp3');


        // 🌟 1. 加载地刺静态贴图 (32x32 像素)
    this.load.image('thorns_skin', 'assets/images/Thorns.png');
    
    // 🌟 2. 加载商人动画序列帧 (总宽 288x48，共 6 帧，单帧为 48x48)
    this.load.spritesheet('Trader_stand', 'assets/images/Trader_stand.png', { 
        frameWidth: 48, 
        frameHeight: 48 
    });
    
    // 🌟 3. 加载木门动画序列帧 (总宽 576x96，共 6 帧，单帧为 96x96)
    this.load.spritesheet('door_skin', 'assets/images/Key_door_open.png', { 
        frameWidth: 96, 
        frameHeight: 96 
    });

    // 🌟 1. Load Background skin
    this.load.image('bg_block', 'assets/images/Background_block.png');
    
    // 🌟 2. Load Wall & Floor skins (Using files visible in your directory)
    this.load.image('tile_floor', 'assets/images/Cavetile_wall_T.png');     // Top floor surface
    this.load.image('tile_wall', 'assets/images/Cavetile_wall_2L.png');    // Solid inner walls
    
    // 🌟 ADD THIS: Preload the actual spider texture frames into the asset cache registry
    this.load.spritesheet('boss_idle', 'assets/Spider/Spider-Idle.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('boss_run', 'assets/Spider/Spider-Run.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('boss_attack', 'assets/Spider/Spider-Attack.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('boss_dead', 'assets/Spider/Spider-Dead.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('boss_hurt', 'assets/Spider/Spider-Hurt.png', { frameWidth: 64, frameHeight: 64 });
}

create() {

    // (清理) 移除开发期调试 console.log (boss_idle 贴图检查)

    // 1. Set the physics world to match your terrain height (Rows * TileSize)
    // (修复) 删除死代码: 世界/相机边界在下方按地形实际尺寸重设 (world=mapWidth×mapHeight, camera=0~1578), 此处 5000×960 与 1440-3200 会被立即覆盖, 注释也错(G 实为 32)

    // (修复) 探索 BGM 改走 AudioSystem 统一管理: 离场被下个场景 stopBGM 停掉(不漏音)+跟随音量设置; 原 'bgm_SafeZone5' 大小写错(实际 key 小写)
    if (typeof AudioSystem !== 'undefined') AudioSystem.bgm(this, 'bgm_safezone5');
    // (合并) 物理 debug draw 关闭 (队友开发期临时开的, 上线不显示碰撞框)
    try {
        const w = this.physics.world;
        w.drawDebug = false;
        if (w.debugGraphic) { w.debugGraphic.clear(); w.debugGraphic.setVisible(false); }
        w.defaults.debugShowBody = false;
        w.defaults.debugShowStaticBody = false;
    } catch (e) {}

    this._pickaxeUpgraded = !!this.registry.get('pickaxeUpgraded');
    this.WARNING_DISTANCE = 280; this.HEAVY_FLY_LIMIT = 214; this.CRITICAL_DISTANCE = 380;
    this.activeEnd1 = 14; this.activeEnd2 = 14;
    this._registerMonsterAnims();

    const G = 32;
    const W = 3200;
    const H = 800;

    sz5_arenaLocked = false;
    sz5_dialogueState = 0;
    sz5_currentLine = 0;
    sz5_bossBeatenSequence = false;
    sz5_roarAlertTriggered = false;   // (修复) 漏重置 → 二周目/死亡重进时半路咆哮警告不再触发
    sz5_currentReliefLine = 0;        // (修复) 漏重置 → 重进时释怀对话从残留行号开始(可能越界)
    this.playerCanMove = true;

    if (typeof BossManager !== 'undefined') {
    BossManager.entity = null; // Clears old references to prevent premature win condition loops on boot
}

    this.cameras.main.setBackgroundColor('#050510');
    const mapWidth = sz5_terrain[0].length * 32;
const mapHeight = sz5_terrain.length * 32;
this.physics.world.setBounds(0, 0, mapWidth, mapHeight);
this.cameras.main.setBounds(0, 0, 1578, mapHeight);

    // 🌟 CLEAN FIX: Checks for your preloaded block texture and stretches the tile sprite to match world bounds
if (this.textures.exists('bg_block')) {
    // Center it in the middle of your 3200x800 world layout space
    this.bg = this.add.tileSprite(W / 2, H / 2, W, H, 'bg_block');
    
    // setScrollFactor(1) makes the background naturally parallax/scroll behind the player
    // If you want it stuck to your camera window instead, leave it at 0
    this.bg.setScrollFactor(1).setDepth(-100);
}

    this._initT1State();
    this.input.mouse.disableContextMenu();
    this._registerAnims();

    this.keyJump   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyJumpW  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);   
    this.keyCrouch = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyF      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.keyE      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyShift  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.keyR      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.keyESC    = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.input.keyboard.addCapture([
        Phaser.Input.Keyboard.KeyCodes.SHIFT,
        Phaser.Input.Keyboard.KeyCodes.SPACE,
        Phaser.Input.Keyboard.KeyCodes.F,
        Phaser.Input.Keyboard.KeyCodes.E,
        Phaser.Input.Keyboard.KeyCodes.S,
        Phaser.Input.Keyboard.KeyCodes.R,
        Phaser.Input.Keyboard.KeyCodes.Z,
        Phaser.Input.Keyboard.KeyCodes.X,
        Phaser.Input.Keyboard.KeyCodes.C,
        Phaser.Input.Keyboard.KeyCodes.B,
    ]);

    const boundsX = 0;
    const boundsY = 0;
    const boundsW = W;
    const boundsH = H;
    this.gridSystem = new GridSystem(this, G, boundsW, boundsH, boundsX, boundsY);

    this.walls = this.physics.add.staticGroup();
    this.platforms = this.physics.add.staticGroup();
    this.bgBlocks = this.physics.add.staticGroup();
    this.crystalBlocks = this.physics.add.staticGroup();
    this.wallRects = [];
    this.droppedCrystals = this.physics.add.group();
    this.spiders = this.physics.add.group();
    this.bungeeSpiders = this.physics.add.group();
    this.bats = this.physics.add.group();
    this.earthworms = this.physics.add.group();
    this.slimes = this.physics.add.group();
    this.beetles = this.physics.add.group();
    this.mimicOres = this.physics.add.group();
    this.volatileCrystals = this.physics.add.group();

    sz5_hazards = this.physics.add.staticGroup(); 
    sz5_bullets = this.physics.add.group();
    sz5_exitStairs = this.physics.add.staticGroup(); 

    this.buildCaveDecorations();

    // 🌟 REPLACED: Positions the spawn door exactly on the new 32px starting floor
sz5_spawnDoor = this.add.sprite(20, 350, 'door_skin', 0).setDepth(5);
sz5_spawnDoor.setDisplaySize(32, 96);

// 🌟 REPLACED: Shrinks and moves the arena entry door to Column 54 (X: 1728)
sz5_bossDoor = this.add.sprite(1588, 320, 'door_skin', 0).setDepth(5);   // (修复) 第4参原是函数 i=>i.setFrame(0) 被当帧名 → 报 no frame; 改帧索引 0
sz5_bossDoor.setDisplaySize(128, 128);

// 🌟 REPLACED: 修正物理隔离墙的坐标，使其严丝合缝地挡在右侧隐藏楼梯的入口前方 (X: 2832)
        sz5_exitWall = this.add.image(2550, 600, 'tile_wall').setDepth(11);
        sz5_exitWall.setDisplaySize(48, 250); // 强行拉高加厚，确保形成一道不可逾越的高墙
        
        this.physics.add.existing(sz5_exitWall, true);
        if (sz5_exitWall.body && sz5_exitWall.body.updateFromGameObject) {
            sz5_exitWall.body.updateFromGameObject(); // 强行刷新物理包围盒，防止玩家穿模
        }
        this.walls.add(sz5_exitWall);

    for (let r = 0; r < sz5_terrain.length; r++) {
        for (let c = 0; c < sz5_terrain[r].length; c++) {
            let xPos = c * G + (G / 2);
            let yPos = r * G + (G / 2);

            if (sz5_terrain[r][c] === 1) { 
    // 🌟 SMART SKINNING: If row above is empty air (0), it's a floor top! Otherwise it's a solid inner wall block.
    let isFloorSurface = (r === 0 || sz5_terrain[r - 1][c] === 0);
    let skinKey = isFloorSurface ? 'tile_floor' : 'tile_wall';

    // Create the block as an image texture rather than a solid primitive rectangle
    let block = this.add.image(xPos, yPos, skinKey);
    block.setDisplaySize(G, G); // Assures asset limits conform exactly to your 32px constraints
    
    this.physics.add.existing(block, true);
    this.walls.add(block); 

    if (xPos >= 1728) {
        this.platforms.add(block);
    }
    
    this.wallRects.push({
        x: xPos - G/2, y: yPos - G/2,
        width: G, height: G,
        left: xPos - G/2, right: xPos + G/2,
        top: yPos - G/2, bottom: yPos + G/2
    });
} else if (sz5_terrain[r][c] === 2) {
    // 🌟 用加载好的真实尖刺图片替换原有的彩色三角形
    let spike = this.add.image(xPos, yPos, 'thorns_skin');
    spike.setDisplaySize(G, G); // 强制缩放到 32px 大小完美契合网格
    
    this.physics.add.existing(spike, true);
    
    // 适当缩小刺的物理判定区，防止玩家稍微擦边就被判定受伤
    if (spike.body) {
        spike.body.setSize(24, 16);
        spike.body.setOffset(4, 16);
    }
    sz5_hazards.add(spike);
}else if (sz5_terrain[r][c] === 3) {
                let step = this.add.rectangle(xPos, yPos, G, G, 0x1a0f2e);
                step.setStrokeStyle(2, 0x3b2d59);
                this.physics.add.existing(step, true);
                sz5_exitStairs.add(step);
                step.setVisible(false);
                step.body.enable = false;
            }
        }
    }

    this.add.text(120, 520, ">> DEEP MINES AHEAD >>", { fontSize: '24px', fill: '#00ffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4 }).setDepth(10);
   // 🌟 核心修改：改为 this.finalHint，使其变成全局可访问的对象
this.finalHint = this.add.text(2600, 400, ">> WARNING: MATRIARCH LAIR >>", { fontSize: '28px', fill: '#ff0000', fontStyle: 'bold', stroke: '#000000', strokeThickness: 6 }).setDepth(10);

    // 🌟 REPLACED: Aligns the physics force field barrier to match the entry gate location
sz5_bossBarrier = this.add.rectangle(1538, 300, 24, 250, 0x8888ff, 0.5);
    this.physics.add.existing(sz5_bossBarrier, true);
    sz5_bossBarrier.setVisible(false);
    sz5_bossBarrier.body.enable = false; // 🌟 FIXED

    sz5_merchant = this.add.sprite(225, 342, 'trader_stand').setDepth(6);
    this.sz5_merchantOriginX = 225; // Define new class property
    this.sz5_merchantOriginY = 342; // Define new class property
    sz5_merchant.setDisplaySize(48, 48);  
    sz5_merchant.setFlipX(true);
    if (this.anims.exists('trader_stand')) {
    sz5_merchant.play('trader_stand');
}  

    // (合并) 自建对话框/SKIP 按钮的创建与点击跳过逻辑已移除 — 改用项目 DialogSystem

    // (合并) 删掉 this._applyLevelData() 调用 — 你保留的那版按旧 SZ5 (G=32) 关卡数据重建地形,
    //   会把要删的旧 BackgroundBlock/wall 盖在 boss 竞技场上. 本关卡全靠 sz5_terrain (G=60) 建.

    this._gridGraphics = this.add.graphics().setDepth(0);
    this._gridGraphics.lineStyle(1, 0xffffff, 0.15);
    for (let x = boundsX; x <= boundsX + boundsW; x += G) {
        this._gridGraphics.moveTo(x, boundsY);
        this._gridGraphics.lineTo(x, boundsY + boundsH);
    }
    for (let y = boundsY; y <= boundsY + boundsH; y += G) {
        this._gridGraphics.moveTo(boundsX, y);
        this._gridGraphics.lineTo(boundsX + boundsW, y);
    }
    this._gridGraphics.strokePath();
    this._gridGraphics.setVisible(false);

    this.keyZ = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.keyX = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    this.keyC = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this.keyB = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B);

    if (typeof CavetileWall !== 'undefined' && CavetileWall.renderSkins) {
        CavetileWall.renderSkins(this);
    }

    this.ropePhysics   = new RopePhysics(this);
    this.dashSystem    = new DashSystem(this);
    this.movementSystem= new MovementSystem(this);
    this.throwSystem   = new ThrowSystem(this);
    this.grappleSystem = new GrappleSystem(this);
    this.recallSystem  = new RecallSystem(this);
    this.meleeSystem   = new MeleeSystem(this);

    // (合并修复) 队友引用 spawnX/spawnY 但未声明 → 补定义 (有传入出生点用之, 否则默认 360/440); 同步存 this.spawnX/Y 供框架复活逻辑
    const spawnX = (this._inheritedData && this._inheritedData.spawnX) || 360;
    const spawnY = (this._inheritedData && this._inheritedData.spawnY) || 440;
    this.spawnX = spawnX; this.spawnY = spawnY;

    this.player = new Player(this, 70, 200);

   // 🌟 存档点实体初始化：将存档点放置在通往 Boss 房间的过道平地上（X: 1320, Y: 335）
        this._checkpoint = this.add.sprite(350, 320, 'Checkpoint_unactivated').setDepth(6);
        this._checkpoint.setDisplaySize(64, 128); 
        this._checkpoint.activated = false;       

        // 将其注册为静态物理刚体，以便小人走过去时能发生完美的物理重叠交互
        this.physics.add.existing(this._checkpoint, true);

        // 🌟 核心修复：为原生精灵强行绑定一个空的 setHintVisible 方法存根！
        // 这样当底层的 InteractSystem 无论何时来调用它时，都能安全返回，百分之百防止引发空指针崩溃闪退！
        this._checkpoint.setHintVisible = function(isVisible) {
            // 这里留空即可，完美满足底层框架的接口调用要求
        };



    this._setupRealPickaxes();

    this.physics.add.collider(this.player, this.walls);
    this.physics.add.collider(this.player, sz5_bossBarrier);
    this.physics.add.collider(this.droppedCrystals, this.walls);
    this.physics.add.collider(this.spiders, this.walls);
    this.physics.add.collider(this.bats, this.walls);
    this.physics.add.collider(this.slimes, this.walls);
    this.physics.add.collider(this.beetles, this.walls);
    this.physics.add.collider(this.earthworms, this.walls);
    this.physics.add.collider(this.mimicOres, this.walls);
    this.physics.add.collider(this.bungeeSpiders, this.walls);
    this.physics.add.collider(this.volatileCrystals, this.walls);

    // 🌟【强制兜底】无论 BossAI 内部如何变换技能状态，强制使其在全局保持与 walls 的实体碰撞
this.time.addEvent({
    delay: 100,
    loop: true,
    callback: () => {
        if (typeof BossManager !== 'undefined' && BossManager.entity && BossManager.entity.body) {
            if (!BossManager.entity._hasGlobalWallCollider) {
                BossManager.entity._hasGlobalWallCollider = true;
                this.physics.add.collider(BossManager.entity, this.walls);
                this.physics.add.collider(BossManager.entity, this.platforms);
                // 限制 Boss 刚体的最大下落速度，防止冲刺位移过大直接挤穿刚体表面
                BossManager.entity.body.setMaxVelocity(1200, 1500);
            }
        }
    }
});

    const dmgCheck = (p, m) => {
        if (m.canDamagePlayer && m.canDamagePlayer()) {
            if (this._playerHit) this._playerHit(p, m);
            if (m.onHitPlayer) m.onHitPlayer();
        }
    };
    this.physics.add.overlap(this.player, this.spiders, dmgCheck);
    this.physics.add.overlap(this.player, this.bats, dmgCheck);
    this.physics.add.overlap(this.player, this.slimes, dmgCheck);
    this.physics.add.overlap(this.player, this.beetles, dmgCheck);
    this.physics.add.overlap(this.player, this.earthworms, dmgCheck);
    this.physics.add.overlap(this.player, this.mimicOres, dmgCheck);
    this.physics.add.overlap(this.player, this.bungeeSpiders, dmgCheck);
    this.physics.add.overlap(this.player, this.volatileCrystals, dmgCheck);
// Thorns (ID: 2) damage overlap tracking handle
this.physics.add.overlap(this.player, sz5_hazards, () => {
    if (this.healthSystem && this.healthSystem.damage) {
        this.healthSystem.damage(2); // Deals 2 damage on spike contact
    }
});
    this.healthSystem    = new HealthSystem(this);    this.healthSystem.init();
    this.diseaseSystem   = new DiseaseSystem(this);   this.diseaseSystem.init();
    this.inventorySystem = new BackpackSystem(this);  this.inventorySystem.init();
    this.backpackSystem  = this.inventorySystem;
    this.hudSystem       = new HUDSystem(this);       this.hudSystem.init();
    this.settingsSystem  = new SettingsSystem(this);  this.settingsSystem.init();
    if (typeof CreativeSystem !== 'undefined') {
        this.creativeSystem  = new CreativeSystem(this);  this.creativeSystem.init();
    }
    this.dialogSystem    = new DialogSystem(this);    this.dialogSystem.init();
    if (typeof QuestSystem !== 'undefined') {
        this.questSystem     = new QuestSystem(this);     this.questSystem.init();
    }
    this.guideSystem     = new GuideSystem(this);     this.guideSystem.init();
    if (typeof ShopSystem !== 'undefined') {
        this.shopSystem      = new ShopSystem(this);      this.shopSystem.init();
    }
    this.interactSystem  = new InteractSystem(this);  this.interactSystem.init();

    if (typeof FogSystem !== 'undefined' && this.gridSystem) {
        const _fg = this.gridSystem;
        this.fogSystem = new FogSystem(this, _fg.cellSize, _fg.cols * _fg.cellSize, _fg.rows * _fg.cellSize, _fg.originX || 0, _fg.originY || 0);
    }

    this.events.on('monster_killed', (mx, my, dropRate) => {
        if (Math.random() <= dropRate) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 5 + Math.random() * 10;
            let targetX = mx + Math.cos(angle) * radius;
            let targetY = my + Math.sin(angle) * radius;
            if (this.wallRects) {
                for (const w of this.wallRects) {
                    if (w.bottom > my - 14 && w.top < my + 14 && targetX > w.left - 10 && targetX < w.right + 10) {
                        targetX = (mx <= (w.left + w.right) / 2) ? w.left - 10 : w.right + 10;
                    }
                }
                let nearestFloorY = Infinity;
                for (const w of this.wallRects) {
                    if (targetX >= w.left && targetX <= w.right && w.top >= my - 4) {
                        if (w.top < nearestFloorY) nearestFloorY = w.top;
                    }
                }
                if (nearestFloorY === Infinity) {
                    targetX = mx; targetY = my;
                } else {
                    targetY = nearestFloorY - 12;
                }
                for (const w of this.wallRects) {
                    if (targetX > w.left - 10 && targetX < w.right + 10 && targetY > w.top - 10 && targetY < w.bottom + 10) {
                        targetX = mx; targetY = my; break;
                    }
                }
            }
            const tex = this.textures.exists('Crystal') ? 'Crystal' : 'drop_crystal_img';
            const c = this.add.image(mx, my, tex);
            if (tex === 'Crystal') c.setDisplaySize(20, 20);
            c.setDepth(8);
            if (this.uiCam) this.uiCam.ignore(c);
            c._isDroppedCrystal = true;
            c._pickupReadyAt = this.time.now + 500;
            c.active = true;
            this.droppedCrystals.add(c);
            this.tweens.add({ targets: c, x: targetX, duration: 350, ease: 'Linear' });
            this.tweens.add({ targets: c, angle: 360, duration: 350, ease: 'Linear' });
            const peakY = Math.min(my, targetY) - 30;
            this.tweens.add({
                targets: c, y: peakY, duration: 175, ease: 'Quad.easeOut',
                onComplete: () => this.tweens.add({
                    targets: c, y: targetY,
                    duration: Math.max(175, Math.sqrt(2 * Math.max(1, targetY - peakY) / ((this.physics && this.physics.world && this.physics.world.gravity.y) || 1200)) * 1000),
                    ease: 'Quad.easeIn',
                    onComplete: () => { c.angle = 0; }
                })
            });
        }
    });

    this.events.on('slime_split', (x, y) => {
        for (let i = 0; i < 2; i++) {
            const mini = new CrystalSlime(this, x + (i === 0 ? -20 : 20), y - 10, true);
            this.slimes.add(mini);
            if (mini.setDepth) mini.setDepth(10);
            if (this.uiCam) { try { this.uiCam.ignore(mini); } catch(e) {} }
            this.physics.add.collider(mini, this.walls);
        }
    });

    this._chunks = [];
    this._currentChunkId = null;

    this.cameras.main.setZoom(2.5);
    this.cameras.main.startFollow(this.player, true, 0.05, 0.05);

    this.cameraSystem = new CameraSystem(this.cameras.main, this.player);
    this.uiCam = this.cameraSystem.setupUICamera(this);

    try {
        this.cameras.main.ignore(this.crosshair);
        this.cameras.main.ignore(this.leftHandIndicator);
        this.cameras.main.ignore(this.rightHandIndicator);
    } catch(e) {}

    this.time.delayedCall(100, () => {
        if (this.hudSystem && this.hudSystem.displayGroup && typeof this.hudSystem.displayGroup.getChildren === 'function') {
            this.hudSystem.displayGroup.getChildren().forEach(item => {
                item.setScrollFactor(0);
                this.cameras.main.ignore(item);
            });
        }
    });

    this._cfgConvMin = 150;   // Merchant dialogue min range step boundary
this._cfgConvMax = 450;   // Merchant dialogue max range step boundary
this._cfgArenaX  = 1750;  // Arena entry trigger line (Scaled to 32px column 55)
this._cfgBossX   = 1800;  // Boss hanging overhead center point X
this._cfgBossY   = 80;    // Boss hanging overhead center point Y (Ceiling mount)
    this._cfgVictoryX = 5880;
    this._cfgVictoryY = 300;

    const cursorTex = this.textures.exists('Mouse_cursor') ? 'Mouse_cursor' : 'crosshair_custom';
    this.crosshair          = this.add.sprite(0, 0, cursorTex).setDepth(999999).setScrollFactor(0);
    { const _p0 = this.input && this.input.activePointer; if (_p0) this.crosshair.setPosition(_p0.x, _p0.y); }
    if (cursorTex !== 'Mouse_cursor') this.crosshair.setTint(0xffff00);
    this.leftHandIndicator  = this.add.sprite(0, 0, 'left_hand_icon').setDepth(999998).setVisible(false).setScrollFactor(0);
    this.rightHandIndicator = this.add.sprite(0, 0, 'right_hand_icon').setDepth(999998).setVisible(false).setScrollFactor(0);
    this.input.on('pointermove', (pointer) => {
        if (!this.crosshair) return;
        this.crosshair.setPosition(pointer.x, pointer.y);
        this.leftHandIndicator.setPosition(pointer.x - 22, pointer.y);
        this.rightHandIndicator.setPosition(pointer.x + 22, pointer.y);
    });
    this.game.canvas.style.cursor = 'none';

    this.input.on('pointerdown', (pointer) => {
            // (合并) 自建对话推进逻辑已移除: DialogSystem 自带点击推进; 对话期间下方 dialogSystem.isOpen 守卫会拦截投镐

            if (!this.player.body || this.isPlayerStunned || this.isDead) return;
            if (this._cinematicLock) return;
            if (this.shopSystem?.isOpen || this.hudSystem?.gamePausedByConfirm) return;
            if (this.backpackSystem?.isOpen || this.settingsSystem?.isOpen || this.creativeSystem?.isOpen) return;
            if (this.dialogSystem?.isOpen || this.guideSystem?.isOpen) return;
            if (this._suppressNextClick) { this._suppressNextClick = false; return; }
            if (this._isClickOnHUDButton(pointer)) return;

            let item = this.inventorySystem?.getActiveItem?.();
            let holdingPickaxe = item && item.type === 'pickaxe';
            let side = this.player.pState?.activeHand;
            let pick = side === 'left' ? this.pick1 : this.pick2;

            if (pointer.button === 2) {
                if (holdingPickaxe && this._pickaxeUpgraded) {
                    pick.state === 'idle' ? this.throwSystem.releaseThrow(pointer) : this.recallSystem.startRecall(pick);
                }
            } else if (pointer.button === 0) {
                if (holdingPickaxe && pick.state === 'attached' && this._pickaxeUpgraded) {
                    this.grappleSystem.startZip(pick);
                } else {
                    if (this.meleeSystem.execute()) {
                        this._checkMeleeOnCrystalOres();
                    }
                }
            }
        });

    this._applyInheritedState();
    if (typeof SaveSystem !== 'undefined') SaveSystem.autoSave(this);

    this._cinematicLock = true;
    this.cameras.main.fadeIn(800);
    this.time.delayedCall(900, () => {
        this._cinematicLock = false;
    });

    // 让 Boss 的实体能够伤害玩家
this.physics.add.overlap(this.player, BossManager.entity, (player, boss) => {
    // 检查玩家是否有 takeDamage 方法且当前不在无敌帧
    if (player.takeDamage) {
        player.takeDamage(10); // 10 是伤害数值
        
        // 增加一个简单的视觉反馈：玩家被撞击抖动
        this.cameras.main.shake(100, 0.01);
    } else {
        // 如果你的玩家伤害逻辑在 HealthSystem 里：
        if (this.healthSystem) {
            this.healthSystem.damage(10);
        }
    }
}, null, this);
    setTimeout(() => { try { if (this._cinematicLock) this._cinematicLock = false; } catch (e) {} }, 2000);
}

    buildCaveDecorations() {
        // (合并) 队友代码引用此方法但项目中原本不存在 → 空实现避免崩溃 (背景装饰可后补)
    }

    _applyInheritedState() {
        const data = this._inheritedData || {};
        // (用户) 一次性剧情完成标志随档恢复 — 防止已读剧情重播/触发器卡死玩家
        if (data.plotFlags) { try { for (const k in data.plotFlags) { if (data.plotFlags[k] === true && !/CutsceneStarted$/.test(k)) this[k] = true; } } catch (e) {} }   // (用户) Started 瞬态不恢复 (兼容老档)
        if (typeof data.playMs === 'number') { this._playMsBase = data.playMs; this._playStartAt = Date.now(); }   // (用户) 局内时间随档续算
        // (用户) 黄水晶继承 — 与 SZ1 同款
        if (typeof data.yellowCrystalCount === 'number' && this.hudSystem) {
            this.hudSystem.yellowCrystalCount = data.yellowCrystalCount;
            if (data.yellowCrystalShown) this.hudSystem.yellowCrystalShown = false;
            if (this.hudSystem.addYellowCrystal) this.hudSystem.addYellowCrystal(0);
        }
        if (typeof data.crystalCount === 'number' && this.hudSystem) {
            this.hudSystem.crystalCount = data.crystalCount;
            if (this.hudSystem.refreshCrystal) this.hudSystem.refreshCrystal();
        }
        if (data.inventorySlots && this.inventorySystem) {
            for (let i = 0; i < data.inventorySlots.length; i++) {
                this.inventorySystem.slots[i] = data.inventorySlots[i];
            }
            if (this.inventorySystem.refresh) this.inventorySystem.refresh();
        }
        if (this.healthSystem) {
            if (typeof data.maxHp === 'number') this.healthSystem.maxHp = data.maxHp;
            if (typeof data.hp === 'number')    this.healthSystem.hp = data.hp;
            if (typeof data.hearts === 'number') this.healthSystem.hearts = data.hearts;
            if (this.healthSystem.refresh) this.healthSystem.refresh();
        }
        // 健康侦测仪 flag + 激活腐蚀度条
        if (data.hasHealthDetector) {
            this._hasHealthDetector = true;
            if (this.diseaseSystem && this.diseaseSystem.setBarVisible) {
                this.diseaseSystem.setBarVisible(true);
            }
            if (this.hudSystem && this.hudSystem._updateHealthDetectorLayout) {
                this.hudSystem._updateHealthDetectorLayout(true);
            }
        }
        // 腐蚀度进度继承
        if (typeof data.corrosionPct === 'number' && this.diseaseSystem) {
            this.diseaseSystem.corrosionPct = data.corrosionPct;
            if (this.diseaseSystem._updateUI) this.diseaseSystem._updateUI();
        }
    }

    _registerAnims() {

        // 🌟 build the animation loops the boss AI expects:
        // (修复) end 改为按贴图实际帧数自适应 (frameTotal-2, 已含 __BASE); 原写死 3/5/4/4/2 超界, 控制台刷 "Frame N not found"
if (this.textures.exists('boss_idle') && !this.anims.exists('anim_boss_idle')) {
    const ft = this.textures.get('boss_idle').frameTotal;
    this.anims.create({ key: 'anim_boss_idle', frames: this.anims.generateFrameNumbers('boss_idle', { start: 0, end: Math.max(0, ft - 2) }), frameRate: 8, repeat: -1 });
}
if (this.textures.exists('boss_run') && !this.anims.exists('anim_boss_run')) {
    const ft = this.textures.get('boss_run').frameTotal;
    this.anims.create({ key: 'anim_boss_run', frames: this.anims.generateFrameNumbers('boss_run', { start: 0, end: Math.max(0, ft - 2) }), frameRate: 12, repeat: -1 });
}
if (this.textures.exists('boss_attack') && !this.anims.exists('anim_boss_attack')) {
    const ft = this.textures.get('boss_attack').frameTotal;
    this.anims.create({ key: 'anim_boss_attack', frames: this.anims.generateFrameNumbers('boss_attack', { start: 0, end: Math.max(0, ft - 2) }), frameRate: 14, repeat: 0 });
}
if (this.textures.exists('boss_dead') && !this.anims.exists('anim_boss_dead')) {
    const ft = this.textures.get('boss_dead').frameTotal;
    this.anims.create({ key: 'anim_boss_dead', frames: this.anims.generateFrameNumbers('boss_dead', { start: 0, end: Math.max(0, ft - 2) }), frameRate: 10, repeat: 0 });
}
if (this.textures.exists('boss_hurt') && !this.anims.exists('anim_boss_hurt')) {
    const ft = this.textures.get('boss_hurt').frameTotal;
    this.anims.create({ key: 'anim_boss_hurt', frames: this.anims.generateFrameNumbers('boss_hurt', { start: 0, end: Math.max(0, ft - 2) }), frameRate: 12, repeat: 0 });
}

        // 安全注册 — 检查 texture 存在 + 有效 frames
        const safeCreate = (key, textureKey, frameCfg, frameRate, repeat) => {
            if (this.anims.exists(key)) return;
            if (!this.textures.exists(textureKey)) return;
            const frames = this.anims.generateFrameNumbers(textureKey, frameCfg);
            if (!frames || frames.length === 0) {
                console.warn('[anims] no frames for', textureKey, frameCfg);
                return;
            }
            this.anims.create({ key, frames, frameRate, repeat });
        };
        safeCreate('idle',          'Miner_stand',        { start: 0, end: 11 }, 12, -1);
        safeCreate('run',           'Miner_run',          { start: 0, end: 5  }, 12, -1);
        safeCreate('melee_attack',  'Miner_melee_attack', { start: 0, end: 2  }, 20, 0);
        safeCreate('jump',          'Miner_jump',         { start: 0, end: 2  }, 14, 0);
        safeCreate('fall',          'Miner_fall',         { start: 0, end: 2  }, 10, 0);
        safeCreate('crouch',        'Miner_crouch',       { start: 0, end: 5  }, 14, 0);
        safeCreate('crouch_walk',   'Miner_crouch_walk',  { start: 0, end: 9  }, 14, -1);
        safeCreate('trader_stand',  'Trader_stand',       { start: 0, end: 5  }, 8, -1);
        // dash 动画
        safeCreate('dash', 'Miner_dash', { start: 0, end: 3 }, 24, 0);
        safeCreate('melee_attack_slash', 'melee_attack_slash', { start: 0, end: 4 }, 24, 0);

        // 小蜘蛛动画
        if (this.textures.exists('Small_spider_run') && !this.anims.exists('small_spider_run')) {
            this.anims.create({ key: 'small_spider_run', frames: this.anims.generateFrameNumbers('Small_spider_run', { start: 0, end: 3 }), frameRate: 12, repeat: -1 });
        }
        if (this.textures.exists('Small_spider_attack') && !this.anims.exists('small_spider_attack')) {
            this.anims.create({ key: 'small_spider_attack', frames: this.anims.generateFrameNumbers('Small_spider_attack', { start: 0, end: 2 }), frameRate: 14, repeat: 0 });
        }
        if (this.textures.exists('Small_spider_injured') && !this.anims.exists('small_spider_injured')) {
            this.anims.create({ key: 'small_spider_injured', frames: this.anims.generateFrameNumbers('Small_spider_injured', { start: 0, end: 1 }), frameRate: 12, repeat: 0 });
        }
        if (this.textures.exists('Small_spider_dead') && !this.anims.exists('small_spider_dead')) {
            this.anims.create({ key: 'small_spider_dead', frames: this.anims.generateFrameNumbers('Small_spider_dead', { start: 0, end: 0 }), frameRate: 1, repeat: 0 });
        }
        if (this.textures.exists('Small_spider_fall') && !this.anims.exists('small_spider_fall')) {
            this.anims.create({ key: 'small_spider_fall', frames: this.anims.generateFrameNumbers('Small_spider_fall', { start: 0, end: 2 }), frameRate: 12, repeat: -1 });
        }

        // mimic ore 动画
        if (this.textures.exists('Mimic_ore_run') && !this.anims.exists('mimic_ore_run')) {
            const total = this.textures.get('Mimic_ore_run').frameTotal - 2;
            this.anims.create({ key: 'mimic_ore_run', frames: this.anims.generateFrameNumbers('Mimic_ore_run', { start: 0, end: total > 0 ? total : 0 }), frameRate: 10, repeat: -1 });
        }

        // 史莱姆动画
        if (this.textures.exists('Slime_dead') && !this.anims.exists('slime_dead')) {
            this.anims.create({ key: 'slime_dead', frames: this.anims.generateFrameNumbers('Slime_dead', { start: 0, end: 2 }), frameRate: 8, repeat: 0 });
        }
        if (this.textures.exists('Slime_injuried') && !this.anims.exists('slime_injured')) {
            this.anims.create({ key: 'slime_injured', frames: this.anims.generateFrameNumbers('Slime_injuried', { start: 0, end: 1 }), frameRate: 12, repeat: 0 });
        }
        if (this.textures.exists('Slime_jump') && !this.anims.exists('slime_jump')) {
            this.anims.create({ key: 'slime_jump', frames: this.anims.generateFrameNumbers('Slime_jump', { start: 0, end: 2 }), frameRate: 10, repeat: 0 });
        }
        if (this.textures.exists('Slime_fall') && !this.anims.exists('slime_fall')) {
            this.anims.create({ key: 'slime_fall', frames: this.anims.generateFrameNumbers('Slime_fall', { start: 0, end: 3 }), frameRate: 12, repeat: 0 });
        }
        if (this.textures.exists('Slime_attack') && !this.anims.exists('slime_attack')) {
            this.anims.create({ key: 'slime_attack', frames: this.anims.generateFrameNumbers('Slime_attack', { start: 0, end: 2 }), frameRate: 14, repeat: 0 });
        }
    }

    _initT1State() {
        this.lastDashTime = 0; this.dashCooldown = 0;
        this.isDashing = false; this.dashDuration = 120; this.dashSpeed = 1600;
        this.isHanging = false; this.isGrappling = false; this.isCrouching = false;
        this.isPlayerStunned = false; this.isMeleeAttacking = false;
        this.meleeCooldown = 0; this.meleeAttackFlipX = false;
        this.isDead = false;
        this.ropeLength1 = 0; this.ropeLength2 = 0;
    }

update(time, delta) {

    if (this._uiPaused) return;   

    // 🌟 核心新增：玩家死亡自动回溯检查点 + 场景镜头重置全套引擎
        if (this.healthSystem && this.healthSystem.hp <= 0 && !this._playerRespawning) {
            this._playerRespawning = true; // 开启复活锁，防止多帧重复触发
            this.playerCanMove = false;     // 锁定玩家按键
            if (this.player.body) this.player.body.setVelocity(0, 0);
            this.player.setTint(0xff0000);  // 变红代表阵亡

            console.log("Player died. Initiating safe checkpoint roll-back sequence.");

            // 1. 屏幕在1秒内平滑变黑
            this.cameras.main.fadeOut(1000, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                
                // 2. 智能计算复活坐标：如果激活了 Checkpoint 就去 Checkpoint，否则去初始出生点
                let respawnX = this.spawnX || 70;
                let respawnY = this.spawnY || 400;
                if (this._checkpoint && this._checkpoint.activated) {
                    respawnX = this._checkpoint.x;
                    respawnY = this._checkpoint.y;
                }

                // 3. 将小人瞬移过去并解除受伤红色
                this.player.setPosition(respawnX, respawnY);
                this.player.clearTint();

                // 4. 重置血量系统到满血状态 (保底恢复满血)
                if (this.healthSystem.healAmount) {
                    this.healthSystem.healAmount(this.healthSystem.maxHp || 3);
                } else {
                    this.healthSystem.hp = this.healthSystem.maxHp || 3;
                }
                if (this.healthSystem.refresh) this.healthSystem.refresh();

                // 5. 🚨 重点：如果是在 Boss 战中阵亡，彻底重置竞技场和 BGM，防止关卡卡死
                if (sz6_arenaLocked && !sz6_bossBeatenSequence) {
                    if (BossManager.entity) {
                        BossManager.entity.destroy(); // 销毁当前恶魔分身
                    }
                    sz6_arenaLocked = false;
                    sz6_dialogueState = 0; // 允许重新走进竞技场触发 Boss 战

                    // 将激昂的 Boss 战 BGM 切回原本平静的第五安全区环境音乐
                    if (this.currentBGM) this.currentBGM.stop();
                    this.currentBGM = this.sound.add('bgm_safezone5', { loop: true, volume: 0.5 });
                    this.currentBGM.play();
                }

                // 6. 🌟 镜头安全重置：解除 Boss 战视角裁剪束缚，恢复全图视野并重新聚焦锁定小人！
                const mapHeight = sz6_terrain.length * 32;
                this.cameras.main.setBounds(0, 0, 1578, mapHeight);
                this.cameras.main.setZoom(2.5);
                this.cameras.main.startFollow(this.player, true, 0.05, 0.05);

                // 7. 重新允许小人移动，拉开帷幕恢复光明
                this.cameras.main.fadeIn(800);
                this.playerCanMove = true;
                this._playerRespawning = false;
            });
            return; // 截断当前帧，直接进入下一渲染循环
        }

    // 🌟 新增功能：半路惊悚咆哮动态触发器
        if (!sz5_roarAlertTriggered && this.player.x > 900 && this.player.x < 1200) {
            sz5_roarAlertTriggered = true;

            this.sound.play('snd_boss_roar', { volume: 0.7 });
            this.cameras.main.shake(400, 0.012);

            sz5_dialogueState = 1;
            this.playerCanMove = false;
            if (this.player.x && this.player.body) this.player.body.setVelocity(0, 0);

            // (合并) 半路咆哮独白改用 DialogSystem; 播完解锁 + 置 state 2
            const _roarLine = "Miner: ...What on earth was that?! The cavern walls are violently trembling. The Matriarch Mother must be nesting right ahead...";
            if (this.dialogSystem) {
                this.dialogSystem.showSequence([this._sz5DialogEntry(_roarLine)], () => { sz5_dialogueState = 2; this.playerCanMove = true; });
            } else { sz5_dialogueState = 2; this.playerCanMove = true; }
        }
    if (!this.player.body) return;

    if (this._hints) this._hints.forEach(h => h.update());
    if (this._chests) this._chests.forEach(c => c.update());
    if (this._crystalNpcs) this._crystalNpcs.forEach(n => n.update());

    let paused = this.shopSystem?.isOpen || this.hudSystem?.gamePausedByConfirm;

    if (this.dashCooldown > 0)  this.dashCooldown  -= delta;
    if (this.meleeCooldown > 0) this.meleeCooldown -= delta;

    let pointer = this.input.activePointer;
    if (this.crosshair) this.crosshair.setPosition(pointer.x, pointer.y);
    if (this.leftHandIndicator) this.leftHandIndicator.setPosition(pointer.x - 22, pointer.y);
    if (this.rightHandIndicator) this.rightHandIndicator.setPosition(pointer.x + 22, pointer.y);

    if (this.crosshair) this.crosshair.setVisible(!this._cssCursorOverlap);   

    if (this.healthSystem) this.healthSystem.update(delta);
    if (this.diseaseSystem) this.diseaseSystem.update(delta);
    if (this.interactSystem) this.interactSystem.update();
    if (this.fogSystem) this.fogSystem.update(this.player.x, this.player.y);

    if (this.keyR && Phaser.Input.Keyboard.JustDown(this.keyR)) {
        if (this._gridGraphics) {
            this._gridGraphics.setVisible(!this._gridGraphics.visible);
        }
    }
    if (this._gridGraphics && this._gridGraphics.visible) {
        const middleDown = this.input.activePointer.middleButtonDown();
        if (middleDown && !this._middleClickPrev) {
            this._gridCoordVisible = !this._gridCoordVisible;
            if (!this._gridCoordVisible && this._gridCoordText) {
                this._gridCoordText.destroy();
                this._gridCoordText = null;
            }
        }
        this._middleClickPrev = middleDown;

        if (this._gridCoordVisible) {
            const ptr = this.input.activePointer;
            const cam = this.cameras.main;
            const wx = cam.scrollX + (ptr.x - cam.width / 2) / cam.zoom + cam.width / 2;
            const wy = cam.scrollY + (ptr.y - cam.height / 2) / cam.zoom + cam.height / 2;
            const gx = Math.floor(wx / 60);
            const gy = Math.floor(wy / 60);
            if (!this._gridCoordText) {
                this._gridCoordText = this.add.text(0, 0, '', {
                    fontSize: '18px', color: '#00ff00',
                    fontFamily: '"VT323", monospace', align: 'center',
                    stroke: '#000', strokeThickness: 3,
                    backgroundColor: '#000000aa',
                    padding: { x: 6, y: 3 }
                }).setOrigin(0.5).setDepth(900);
                if (this.uiCam) this.uiCam.ignore(this._gridCoordText);
            }
            this._gridCoordText.setPosition(wx, wy - 24);
            this._gridCoordText.setText(`(${gx}, ${gy})\nworld:(${Math.floor(wx)}, ${Math.floor(wy)})`);
        }
    } else if (this._gridCoordText) {
        this._gridCoordText.destroy();
        this._gridCoordText = null;
        this._gridCoordVisible = false;
    }

    if (sz5_dialogueState === 0 && this.player.x > this._cfgConvMin && this.player.x < this._cfgConvMax && this.player.y > 200) {
        sz5_dialogueState = 1;
        this.playerCanMove = false;
        this.player.body.setVelocity(0, 0);
        // (合并) 开场商人对白改用 DialogSystem; 播完解锁 + 置 state 2
        if (this.dialogSystem) {
            this.dialogSystem.showSequence(
                sz5_dialogueLines.map(l => this._sz5DialogEntry(l)),
                () => { sz5_dialogueState = 2; this.playerCanMove = true; }
            );
        } else { sz5_dialogueState = 2; this.playerCanMove = true; }
    }

    // REPLACE your entire arena lock block inside update() with this clean handler:
if (!sz5_arenaLocked && this.player.x > this._cfgArenaX) {
    sz5_arenaLocked = true;
    sz5_dialogueState = 6;
    this.playerCanMove = false;
    if (sz5_merchant) sz5_merchant.setVisible(false);

    // (修复) Boss BGM 也走 AudioSystem — 自动停掉探索曲, 离场也能被统一停掉
    if (typeof AudioSystem !== 'undefined') AudioSystem.bgm(this, 'bgm_spider_boss');

    // 播放开场震撼咆哮音效
    this.sound.play('snd_boss_roar', { volume: 0.8 });

    this.cameras.main.setZoom(2.8); // 这里设置你认为完美的固定放大倍数
    this.cameras.main.startFollow(this.player, true, 0.05, 0.05);
    
    if (this.player.body) {
        this.player.body.setVelocity(0, 0);
        this.player.body.setAcceleration(0, 0);
    }
    
    // 1. 将玩家安全投递到第 1 层（Row 9 高台平面的安全站立高度）
    this.player.setPosition(1600, 270); 

    // 2. 🌟 精准裁剪竞技场的垂直视角高度（从 800px 裁剪到 520px）
    // 这样镜头底部在 y=520 处就会死死卡住，绝对不会向下滚动去跟镜头显示第 15 行的坑底！
    this.cameras.main.setBounds(1520, 0, 1025, 700);
    
    sz5_bossBarrier.setVisible(true);
    this.physics.world.enable(sz5_bossBarrier);
    
    // 🌟 伤害修复：把原来的空函数 () => {} 替换为调用你现有的 healthSystem 扣血包
        if (typeof BossManager !== 'undefined') {
            BossManager.spawn(this, this._cfgBossX, this._cfgBossY, this.player, this.platforms, (p, b) => {
                // 确保游戏没有进入暂停，且健康系统完好
                if (this.healthSystem && this.healthSystem.damage) {
                    this.healthSystem.damage(20); // 👈 每次被 Boss 撞击，强制扣除 1 点血量/爱心
                    this.cameras.main.shake(150, 0.02); // 额外增加一个受击屏幕剧烈抖动反馈，提升打击感
                    
                    // 让小人变成红色闪烁一瞬间代表受伤
                    this.player.setTint(0xff0000);
                    this.time.delayedCall(200, () => { if (this.player) this.player.clearTint(); });
                }
            }, true);
            
            this.time.delayedCall(50, () => {
                if (BossManager.entity && BossManager.entity.body) {
                    BossManager.entity.body.setCollideWorldBounds(true);
                    this.physics.add.collider(BossManager.entity, this.walls);
                    this.physics.add.collider(BossManager.entity, this.platforms);
                    BossManager.entity.surface = 'air';
                }
            });
        }
}

// 🚨 EMERGENCY FLOOR-ANCHOR PATCH
if (sz5_arenaLocked && typeof BossManager !== 'undefined' && BossManager.entity) {
    let boss = BossManager.entity;
    
    // 1. If Boss goes below the floor (Y > 950), force her back to the arena surface
    if (boss.y > 950) {
        boss.y = 600; // Teleport her back to center-arena height
        if (boss.body) {
            boss.body.setVelocityY(0);
            boss.body.setAllowGravity(true);
        }
    }
    
    // 2. Force Enable physics if she's in an active state
    if (boss.body && !boss.body.enable) {
        boss.body.enable = true;
    }
}

    if (sz5_arenaLocked && typeof BossManager !== 'undefined') {
    BossManager.update(time, delta, this.player);

    // 🌟 修复注入：只有 Boss 在场且存活时，飞镐才动态扫描物理重叠
    if (BossManager.entity && BossManager.entity.active) {
        this.physics.overlap([this.pick1, this.pick2], BossManager.entity, (pick, boss) => {
            if (pick.state === 'flying_max' || pick.state === 'flying_gravity' || pick.state === 'dropping') {
                boss.takeDamage(1); 
                this.cameras.main.shake(200, 0.015);
                this.recallSystem.startRecall(pick); 
            }
        });
    }
    
    // 🌟 FIXED: Added 'BossManager.entity &&' so it doesn't trick itself on frame 1
    if (BossManager.entity && !sz5_bossBeatenSequence && !BossManager.entity.active) {
        this._bossDeathHandled = true;
        sz5_bossBeatenSequence = true;
        this.revealEndgamePassage();
    }
}

    if (paused || this.isDead) return;

    if (this.playerCanMove) {
        if (!this.isPlayerStunned && this.movementSystem) {
            this.movementSystem.update(time, delta);
            this._updateRealPickaxes(time, delta);
        }
    } else {
        this.player.body.setVelocityX(0);
        this.player.anims.play('idle', true);
    }

    if (this.backpackSystem) {
        const k = Phaser.Input.Keyboard;
        if (this.keyZ && k.JustDown(this.keyZ)) this.backpackSystem.useQuickSlot(0);
        if (this.keyX && k.JustDown(this.keyX)) this.backpackSystem.useQuickSlot(1);
        if (this.keyC && k.JustDown(this.keyC)) this.backpackSystem.useQuickSlot(2);
        if (this.keyB && k.JustDown(this.keyB)) {
            if (!this.settingsSystem?.isOpen) this.backpackSystem.toggle();
        }
    }
    if (this.keyESC && Phaser.Input.Keyboard.JustDown(this.keyESC)) {
        if (!this.backpackSystem?.isOpen) this.settingsSystem?.toggle();
    }

    if (this.inventorySystem) this.inventorySystem.update(delta);
    if (this.dialogSystem) this.dialogSystem.update();
    if (this.hudSystem && this.hudSystem.updateGuideButton) this.hudSystem.updateGuideButton();
    this._updateMonstersFiltered(time, delta);
    this._updateChunkCamera();
    this._checkPlatformGuide();
    this._checkPendingRespawns();
    this._checkCheckpoint();
    this._updateYellowDirtSpread(delta);

    if (this.droppedCrystals) {
        this.droppedCrystals.getChildren().forEach(c => {
            if (!c.active) return;
            if (c._pickupReadyAt && this.time.now < c._pickupReadyAt) return;
            if (c._flying) return;
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, c.x, c.y);
            if (dist <= 160) {
                c._flying = true;
                if (c.body) c.body.enable = false;
                this.tweens.add({
                    targets: c,
                    x: () => this.player.x,
                    y: () => this.player.y,
                    duration: 250,
                    ease: 'Cubic.easeIn',
                    onUpdate: () => { if (c.scale > 0.5) c.scale -= 0.02; },
                    onComplete: () => {
                        c.destroy();
                        if (this.hudSystem) this.hudSystem.addCrystal(1);
                    }
                });
            }
        });
    }

    if (this._chestDrops && this._chestDrops.length > 0) {
        this._chestDrops = this._chestDrops.filter(d => d && d.active);
        this._chestDrops.forEach(d => {
            if (!d.active || d._flying) return;
            if (d._pickupReadyAt && this.time.now < d._pickupReadyAt) return;
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, d.x, d.y);
            if (dist <= 160) {
                d._flying = true;
                this.tweens.add({
                    targets: d,
                    x: () => this.player.x,
                    y: () => this.player.y,
                    duration: 250,
                    ease: 'Cubic.easeIn',
                    onUpdate: () => { if (d.scale > 0.5) d.scale -= 0.02; },
                    onComplete: () => {
                        if (d._dropKind === 'crystal') {
                            if (this.hudSystem) this.hudSystem.addCrystal(1);
                        } else if (d._dropKind === 'potion') {
                            const t = d._dropType;
                            if (t === 'life_potion') {
                                if (this.healthSystem) this.healthSystem.addHeart(1);
                            } else if (t === 'healing_potion' || t === 'health_potion') {
                                if (this.inventorySystem) this.inventorySystem.addItem(t, 1);
                            }
                        }
                        d.destroy();
                    }
                });
            }
        });
    }
  // ================= 🌟 史诗电影级终章谢幕触发器 (主更新循环) =================
    // 检查 Boss 被击败，且主角真正爬上了最右侧的通关楼梯 (x > 2900)
    // 引入 this._endingStarted 判定锁，确保整套逻辑在通关时有且仅执行一次
    // ================= 🌟 史诗电影级终章谢幕触发器 (主更新循环) =================
    // 修改判定：只有当 Boss 死了、玩家和商人聊完了天 (sz5_dialogueState === 8)、并且走到了最顶端的最终边界
    if (this._readyForReliefDialogue && sz5_dialogueState === 8 && this.player.x > 2920) {
        sz5_dialogueState = 9; // 锁死，防止逻辑重复执行引发文字重叠
        this.playerCanMove = false;
        if (this.player.body) this.player.body.setVelocity(0, 0);

        console.log("Player reached the final surface boundary! Rolling cinema credits.");

        let blackScreen = this.add.rectangle(800, 400, 2000, 2000, 0x000000).setScrollFactor(0).setDepth(99999);
        blackScreen.alpha = 0;

        this.tweens.add({
            targets: blackScreen,
            alpha: 1,
            duration: 2000,
            onComplete: () => {
                let creditTexts = [
                    "With a final, echoing crash of the twin pickaxes,\nthe heart of the abyss shattered...",
                    "Through unimaginable effort and unbreakable grit,\nthe corrupted mother was pacified.",
                    "The toxic, blue bacterium crystalline grid began to fade,\nits volatile sickness draining away from the ancient stone.",
                    "In its place, a warmth washed over the deep mines.\nThe malignant shards transmuted, crystallizing into pure, dormant Yellow Stone.",
                    "The rhythmic pulse of the earth returned to a calm cadence.\nThe deep dark was finally... at peace.",
                    "THANK YOU FOR PLAYING\n\n[ ABYSS MINER: CAPSTONE EDITION ]",
                    "DEVELOPED BY TRI-CORE STUDIOS\n\nANG YEN PENG\nDYLAN TAN CHUN WEI\nLOW YONG YI"
                ];

                let idx = 0;
                let showNext = () => {
                    if (idx >= creditTexts.length) {
                        this.scene.start('TitleScene'); 
                        return;
                    }
                    let lbl = this.add.text(800, 360, creditTexts[idx], {
                        fontSize: idx >= 5 ? '46px' : '34px',
                        fill: idx === 3 ? '#ffcc44' : idx >= 5 ? '#00ffff' : '#ffffff',
                        fontFamily: 'Courier',
                        fontStyle: 'bold',
                        align: 'center',
                        lineSpacing: 16
                    }).setOrigin(0.5).setScrollFactor(0).setDepth(100000).setAlpha(0);

                    this.tweens.add({
                        targets: lbl,
                        alpha: 1,
                        duration: 1000,
                        onComplete: () => {
                            this.time.delayedCall(idx >= 5 ? 4000 : 2500, () => {
                                if (!this || !lbl.active) return;
                                this.tweens.add({
                                    targets: lbl,
                                    alpha: 0,
                                    duration: 1000,
                                    onComplete: () => {
                                        lbl.destroy();
                                        idx++;
                                        showNext();
                                    }
                                });
                            });
                        }
                    });
                };
                showNext();
            }
        });
    }
    // ===========================================================================
}
    _updateYellowDirtSpread(delta) {
        const sp = this._yellowDirtSpread;
        if (!sp || !sp.active) return;
        sp.radius += (delta / 1000) * 5 * 32;
        const r2 = sp.radius * sp.radius;
        const z2 = this._chunks.find(c => c.id === 'zone2');
        const z2x1 = z2.x1 * 32, z2x2 = (z2.x2 + 1) * 32;
        const z2y1 = z2.y1 * 32, z2y2 = (z2.y2 + 1) * 32;
        if (sp.maxRadius == null) {
            const corners = [
                { x: z2x1, y: z2y1 }, { x: z2x2, y: z2y1 },
                { x: z2x1, y: z2y2 }, { x: z2x2, y: z2y2 }
            ];
            sp.maxRadius = Math.max(...corners.map(c => Math.hypot(c.x - sp.cx, c.y - sp.cy)));
        }
        // 标记坐标（zone2 外的也要染色）
        const markedCells = this._yellowDirtMarkedCells;
        const G = 32;
        const isMarkedPos = (x, y) => {
            for (const [col, row] of markedCells) {
                if (Math.abs(x - (col * G + G / 2)) < 1 && Math.abs(y - (row * G + G / 2)) < 1) return true;
            }
            return false;
        };
        this.children.list.forEach(obj => {
            if (!obj || !obj.texture || !obj.texture.key) return;
            const key = obj.texture.key;
            if (!key.startsWith('Cavetile_wall_')) return;
            const inZone2 = obj.x >= z2x1 && obj.x <= z2x2 && obj.y >= z2y1 && obj.y <= z2y2;
            const isMarked = isMarkedPos(obj.x, obj.y);
            if (!inZone2 && !isMarked) return;
            const dx = obj.x - sp.cx, dy = obj.y - sp.cy;
            if (dx * dx + dy * dy > r2) return;
            const suffix = key.substring('Cavetile_wall_'.length);
            // 神像下方 6 格第一层（col 17~22, row 21）的 _T 皮肤改成 grass_T
            const col = Math.floor(obj.x / G);
            const row = Math.floor(obj.y / G);
            let newKey;
            if (suffix === 'T' && row === 21 && col >= 17 && col <= 22) {
                newKey = 'Yellow_dirt_grass_T';
            } else {
                newKey = 'Yellow_dirt_' + suffix;
            }
            if (this.textures.exists(newKey)) {
                obj.setTexture(newKey);
            }
        });
        if (sp.radius >= sp.maxRadius) {
            sp.active = false;
            this._finalizeYellowDirtSkins();
        }
    }

    /** 扩散结束 — 标记坐标都改成 yellowdirt 对位皮肤（fallback，确保都被染色） */
    _finalizeYellowDirtSkins() {
        const markedCells = this._yellowDirtMarkedCells || [];
        const G = 32;
        for (const [col, row] of markedCells) {
            const cx = col * G + G / 2;
            const cy = row * G + G / 2;
            this.children.list.forEach(obj => {
                if (!obj || !obj.texture || !obj.texture.key) return;
                const key = obj.texture.key;
                if (!key.startsWith('Cavetile_wall_')) return;
                if (Math.abs(obj.x - cx) < 1 && Math.abs(obj.y - cy) < 1) {
                    const suffix = key.substring('Cavetile_wall_'.length);
                    const newKey = 'Yellow_dirt_' + suffix;
                    if (this.textures.exists(newKey)) {
                        obj.setTexture(newKey);
                    }
                }
            });
        }
    }

    _checkCheckpoint() {
        if (!this._checkpoint || !this.player) return;
        
        const cp = this._checkpoint;
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, cp.x, cp.y);
        
        // 自动感应激活（玩家走近到 50 像素以内时触发）
        if (!cp.activated && dist <= 50) {
            cp.activated = true; 
            
            cp.setTexture('Checkpoint_activating');
            this.sound.play('snd_egg_lay', { volume: 0.5, pitch: 1.6 });

            this.time.delayedCall(400, () => {
                if (cp) cp.setTexture('Checkpoint_activated');
            });

            // 🌟 净化微型冲击波半径（320 像素 = 方圆 10 格大区域）
            let purificationRadius = 320; 

            // 深度扫描当前场景里的所有渲染对象
            this.children.list.forEach(obj => {
                if (!obj || !obj.texture || !obj.texture.key) return;

                let blockDist = Phaser.Math.Distance.Between(obj.x, obj.y, cp.x, cp.y);
                
                if (blockDist <= purificationRadius) {
                    let key = obj.texture.key;

                    // 🟢 1. 优先判定：如果是地表层地板线 (tile_floor) -> 100% 换成带草皮的 T 系列边缘
                    if (key === 'tile_floor' || key.endsWith('_T')) {
                        obj.setTexture('Yellow_dirt_T');
                    } 
                    // 🪨 2. 如果是前景实心变异内墙
                    else if (key.startsWith('Cavetile_wall_') || key === 'tile_wall') {
                        let suffix = key.split('Cavetile_wall_')[1];
                        
                        if (suffix === '2L') {
                            obj.setTexture('Yellow_dirt_L');
                        } else if (suffix && suffix.startsWith('T')) {
                            obj.setTexture('Yellow_dirt_T'); // 包含顶部的也换成草皮
                        } else {
                            // 其余普通的实心墙面，随机爆发亮闪闪的黄水晶矿
                            let crystalVariations = ['Yellow_dirt_5LC1', 'Yellow_dirt_5LC2', 'Yellow_dirt_5LC3'];
                            let choice = crystalVariations[Phaser.Math.Between(0, crystalVariations.length - 1)];
                            obj.setTexture(choice);
                        }
                    } 
                    // 🧱 3. 核心修复：如果是任何背景层方块 (通过检查贴图名字是否包含 bg 或 bg_block 强制抓取)
                    else if (key === 'bg_block' || key.toLowerCase().includes('bg') || obj._isBackgroundBlock) {
                        if (this.textures.exists('Yellow_bg')) {
                            obj.setTexture('Yellow_bg');
                            obj.setTint(0x777777); // 给予稍微暗淡的弱光 Tint，完美保留前后视差空间层级
                        }
                    }
                }
            });

            // 圣光文本提示飘出
            let activeText = this.add.text(cp.x, cp.y - cp.displayHeight/2 - 20, "SAFE ZONE BOUNDARY ESTABLISHED", {
                fontSize: '15px',
                fill: '#ffd86a',
                fontStyle: 'bold',
                fontFamily: 'monospace',
                stroke: '#000000',
                strokeThickness: 4
            }).setOrigin(0.5).setDepth(100);

            this.tweens.add({
                targets: activeText,
                y: '-=40',
                alpha: 0,
                duration: 1800,
                ease: 'Quad.easeOut',
                onComplete: () => activeText.destroy()
            });
        }

        // 圣光温泉持续回血机制
        const inHealRange = dist <= 160; 
        if (cp.activated && inHealRange) {
            const now = this.time.now;
            if (!this._checkpointHealNextAt) this._checkpointHealNextAt = now + 1000;
            if (now >= this._checkpointHealNextAt) {
                if (this.healthSystem && this.healthSystem.healAmount) this.healthSystem.healAmount(1);
                if (this.diseaseSystem && this.diseaseSystem.reduceCorrosion) this.diseaseSystem.reduceCorrosion(1);
                this._checkpointHealNextAt = now + 1000;
            }
        } else {
            this._checkpointHealNextAt = 0;
        }
    }

    /** 玩家近战时检查是否打中水晶矿 */
    /** 玩家近战时检查是否打中水晶矿 或 蜘蛛 Boss */
    _checkMeleeOnCrystalOres() {
        if (!this.player) return;
        
        const RANGE_SQ = 100 * 100, BACK = 40;
        const px = this.player.x, py = this.player.y;
        const facingRight = !this.player.flipX;

        // 🌟 1. 精准追加：检查是否挥砍中蜘蛛 Boss
        let boss = BossManager.entity;
        if (boss && boss.active && !boss.isDead && !boss.isReviving) {
            const dx = boss.x - px, dy = boss.y - py;
            
            // 如果 Boss 在砍击半径内，且方向正确
            if ((dx * dx + dy * dy <= RANGE_SQ) && 
                (!facingRight || dx >= -BACK) && 
                (facingRight || dx <= BACK)) {
                
                // 砍中 Boss，造成 1 点近战直接伤害！
                boss.takeDamage(1); 
                
                if (this.meleeSystem) this.meleeSystem._swingHit = true; 
                if (typeof MeleeSystem !== 'undefined') {
                    MeleeSystem.playSlashEffect(this, boss, px, py);
                }
            }
        }

        // 2. 保留原有的打矿石判定
        if (this._crystalOres) {
            this._crystalOres.forEach(ore => {
                if (ore.destroyed) return;
                const dx = ore.x - px, dy = ore.y - py;
                if (dx * dx + dy * dy > RANGE_SQ) return;
                if (facingRight && dx < -BACK) return;
                if (!facingRight && dx > BACK) return;
                ore.takeHit(3.5);
                if (this.meleeSystem) this.meleeSystem._swingHit = true; 
                if (typeof MeleeSystem !== 'undefined') {
                    MeleeSystem.playSlashEffect(this, ore.sprite || ore, px, py);
                }
            });
        }
    }

    _checkPendingRespawns() {
        if (!this._pendingRespawns || this._pendingRespawns.length === 0) return;
        if (!this.player) return;
        const px = this.player.x / 32, py = this.player.y / 32;
        const now = this.time.now;
        for (let i = this._pendingRespawns.length - 1; i >= 0; i--) {
            const r = this._pendingRespawns[i];
            if (now < r.readyAt) continue;  // 时间还没到
            // 时间到了 — 检查玩家是否在 home chunk 内
            if (r.homeChunk) {
                const c = r.homeChunk;
                const playerInChunk = (px >= c.x1 && px <= c.x2 + 1 && py >= c.y1 && py <= c.y2 + 1);
                if (!playerInChunk) continue;  // 玩家不在 → 继续等
            }
            // 重生
            this._pendingRespawns.splice(i, 1);
            const m = new r.cls(this, r.x, r.y);
            const grp = this[r.groupName];
            if (grp) grp.add(m);
            if (m.setDepth) m.setDepth(10);
            if (this.uiCam) { try { this.uiCam.ignore(m); } catch(e) {} }
            if (r.groupName === 'bats' && m.body) {
                m.body.setAllowGravity(false);
                m.body.setVelocity(0, 0);
            }
            m._spawnX = r.x;
            m._spawnY = r.y;
            m._spawnClass = r.cls;
            m._spawnGroupName = r.groupName;
            m._homeChunk = r.homeChunk;
            // 监听销毁 → 再次调度
            m.once('destroy', () => {
                const delay = Phaser.Math.Between(300000, 480000);
                this._pendingRespawns.push({
                    cls: r.cls, groupName: r.groupName, x: r.x, y: r.y,
                    homeChunk: r.homeChunk, readyAt: this.time.now + delay
                });
            });
        }
    }

    _checkPlatformGuide() {
        if (this._platformGuideUnlocked || !this.player) return;
        if (!this.guideSystem || !this.guideSystem.registerGuide) return;
        if (!this.walls || !this.walls.getChildren) return;
        const G = 32;
        const px = this.player.x, py = this.player.y;
        const wallChildren = this.walls.getChildren();
        for (const w of wallChildren) {
            if (!w || !w._isPlatform) continue;
            const dx = w.x - px, dy = w.y - py;
            if (dx * dx + dy * dy <= (5 * G) * (5 * G)) {
                this._platformGuideUnlocked = true;
                this.guideSystem.registerGuide({
                    id: 'platform',
                    title: 'Platform',
                    animType: 'platform',
                    captionText: 'Jump (SPACE) onto a platform from below. Press S while on top to drop down through it.'
                });
                break;
            }
        }
    }

    _updateChunkCamera() {
        if (!this._chunks || !this.player) return;
        if (this._cinematicLock) return;
        const px = this.player.x / 32;
        const py = this.player.y / 32;
        let newChunk = null;
        for (const c of this._chunks) {
            if (px >= c.x1 && px <= c.x2 + 1 &&
                py >= c.y1 && py <= c.y2 + 1) {
                newChunk = c;
                break;
            }
        }
        if (!newChunk) return;

        // Hysteresis: zone2 → zone1 边界往左移 1 格
        // 默认重叠区在 px=[8.5, 9.5], zone1→zone2 在 px>9.5 切换 (右行)
        // 这里强制 zone2→zone1 只在 px<=7.5 才切回 (左行多走 1 格才切镜头)
        if (this._currentChunkId === 'zone2' && newChunk.id === 'zone1' && px > 7.5) {
            return;
        }

        if (newChunk.id !== this._currentChunkId) {
            this._currentChunkId = newChunk.id;
            const cam = this.cameras.main;
            const x1 = newChunk.x1 * 32;
            const y1 = newChunk.y1 * 32;
            const w  = (newChunk.x2 - newChunk.x1 + 1) * 32;
            const h  = (newChunk.y2 - newChunk.y1 + 1) * 32;
            cam.setBounds(x1, y1, w, h);
            cam.centerOn(this.player.x, this.player.y);
        }
    }

    _isInView(x, y, margin = 250) {
        let v = this.cameras.main.worldView;
        return x > v.x - margin && x < v.right + margin && y > v.y - margin && y < v.bottom + margin;
    }

    _isClickOnHUDButton(pointer) {
        const sx = pointer.x, sy = pointer.y;
        const W = this.cameras.main.width;
        const H = this.cameras.main.height;
        if (Math.abs(sx - (W - 40)) < 32 && Math.abs(sy - 40) < 32) return true;
        if (Math.abs(sx - (W - 100)) < 32 && Math.abs(sy - 40) < 32) return true;
        if (Math.abs(sx - 40) < 32 && Math.abs(sy - (H - 40)) < 32) return true;
        if (Math.abs(sx - 60) < 32 && Math.abs(sy - 180) < 32) return true;
        return false;
    }

    // ============= Boss Intro Cinematic =============
    _startBossIntro() { /* SZ5: stub — boss 还没做 */ }

    _startBossTakeoff() { /* SZ5: stub */ }

    /** Boss 起飞到顶后，双手围着 boss 逆时针绕一圈（半径 2.5 格 = 80px） */
    _startHandsOrbit() { /* SZ5: stub */ }

    _tryFinishBossIntro() { /* SZ5: stub */ }

    _showBossBanner(onDone) {
        const cam = this.cameras.main;
        const W = cam.width, H = cam.height;

        const container = this.add.container(-W, H / 2).setScrollFactor(0).setDepth(999).setScale(2.5);

        // (用户) Banner 重做: 面板同源双层金框 + BOSS 顶标 + 名字底线
        const bg = this.add.rectangle(0, 0, 520, 220, 0x0b0b12, 0.96)
            .setStrokeStyle(3, 0x806020);
        const inner = this.add.rectangle(0, 0, 508, 208, 0x000000, 0)
            .setStrokeStyle(1, 0xffcc44, 0.35);
        const bossLabel = this.add.text(60, -78, '\u2014 BOSS \u2014', {
            fontSize: '16px', color: '#ffd86a', fontFamily: '"VT323", monospace', resolution: 2
        }).setOrigin(0.5);

        // boss 头像占位 — 灰色方块 + X 标记 (待 PNG 替换)
        const portraitBg = this.add.rectangle(-150, 0, 140, 140, 0x1c1828, 1)
            .setStrokeStyle(2, 0x806020);
        const portraitAccent = this.add.rectangle(-150 - 68, 0, 4, 140, 0xffcc44, 1);   // 金侧条
        const px1 = this.add.rectangle(-150, 0, 100, 4, 0x222222); px1.angle = 45;
        const px2 = this.add.rectangle(-150, 0, 100, 4, 0x222222); px2.angle = -45;

        // 名字大字 (居中)
        const nameText = this.add.text(60, 0, 'STONE GUARDIAN', {
            fontSize: '40px', color: '#ffffff',
            fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 5, resolution: 2
        }).setOrigin(0.5);
        // (用户) 横线与菱形按名字实际宽度对齐
        const underline = this.add.rectangle(60, 30, nameText.width + 12, 3, 0xffcc44, 0.9);
        const dOff = nameText.width / 2 + 11;   // (用户) 菱形再贴近一半 (22 → 11)
        const dL = this.add.text(60 - dOff, 0, '\u25C6', { fontSize: '20px', color: '#ffd86a', fontFamily: '"VT323", monospace', resolution: 2 }).setOrigin(0.5);
        const dR = this.add.text(60 + dOff, 0, '\u25C6', { fontSize: '20px', color: '#ffd86a', fontFamily: '"VT323", monospace', resolution: 2 }).setOrigin(0.5);

        container.add([bg, inner, bossLabel, portraitBg, portraitAccent, px1, px2, nameText, underline, dL, dR]);

        this.time.delayedCall(20, () => {
            if (this.cameras.main && container.scene) {
                try { this.cameras.main.ignore(container); } catch(e) {}
            }
        });

        // 元气骑士式: slam in 左 → 停 → slide out 右 (无震屏)
        this.tweens.add({
            targets: container,
            x: W / 2,
            duration: 350,
            ease: 'Back.easeOut',
            onComplete: () => {
                this.time.delayedCall(900, () => {
                    this.tweens.add({
                        targets: container,
                        x: W * 2,
                        duration: 300,
                        ease: 'Back.easeIn',
                        onComplete: () => {
                            container.destroy();
                            if (onDone) onDone();
                        }
                    });
                });
            }
        });
    }

    /** 应用 level data — 用范围 helpers，减少 code */
    _applyLevelData() {
        const G = 32;

        // helpers
        const airRange = (c1, r1, c2, r2) => {
            const cells = new Set();
            for (let c = c1; c <= c2; c++) for (let r = r1; r <= r2; r++) cells.add(c + ',' + r);
            if (this.walls && this.walls.getChildren) {
                this.walls.getChildren().slice().forEach(w => {
                    const wc = Math.floor(w.x / G), wr = Math.floor(w.y / G);
                    if (cells.has(wc + ',' + wr)) w.destroy();
                });
            }
            if (this.wallRects) {
                this.wallRects = this.wallRects.filter(rect => {
                    const wc = Math.floor((rect.x + rect.width / 2) / G);
                    const wr = Math.floor((rect.y + rect.height / 2) / G);
                    return !cells.has(wc + ',' + wr);
                });
            }
            for (let c = c1; c <= c2; c++) for (let r = r1; r <= r2; r++) {
                if (this.gridSystem) this.gridSystem.markRect(c * G + G / 2, r * G + G / 2, G, G, GridSystem.AIR);
            }
        };
        const bgRange = (c1, r1, c2, r2) => {
            for (let c = c1; c <= c2; c++) for (let r = r1; r <= r2; r++) {
                new BackgroundBlock(this, c * G + G / 2, r * G + G / 2, G, G);
            }
        };
        const wallRange = (c1, r1, c2, r2) => {
            const existing = new Set();
            if (this.walls && this.walls.getChildren) {
                this.walls.getChildren().forEach(w => existing.add(Math.floor(w.x / G) + ',' + Math.floor(w.y / G)));
            }
            for (let c = c1; c <= c2; c++) for (let r = r1; r <= r2; r++) {
                if (existing.has(c + ',' + r)) continue;
                new Wall(this, c * G + G / 2, r * G + G / 2, G, G);
            }
        };
        const airBg = (c1, r1, c2, r2) => { airRange(c1, r1, c2, r2); bgRange(c1, r1, c2, r2); };
        const placePlatform = (c, r) => {
            if (typeof PlatformBlock === 'undefined') return;
            // 必须先清掉这格的 wall (防止 wall+platform 叠一起变"透明墙")
            airRange(c, r, c, r);
            const p = new PlatformBlock(this, c * G + G/2, r * G + G/2, G, G);
            if (p.rect && p.rect.body) {
                if (p.rect.body.updateFromGameObject) p.rect.body.updateFromGameObject();
                p.rect.body.checkCollision.down = false;
                p.rect.body.checkCollision.left = false;
                p.rect.body.checkCollision.right = false;
                p.rect.body.checkCollision.up = true;
            }
        };

        // === 1 区房间（左侧主房间）— level_1777648018535 ===
        wallRange(-29, 14, -29, 18);
        wallRange(-28, 13, -28, 14);
        wallRange(-27, 12, -27, 13);
        wallRange(-26, 12, -23, 12);
        wallRange(-23, 13, -22, 13);
        wallRange(-22, 14, -21, 14);
        wallRange(-28, 19, -28, 19);
        airBg(-28, 14, -23, 19);
        airBg(-27, 13, -23, 13);
        airBg(-26, 12, -23, 12);
        airBg(-22, 16, 0, 19);
        airBg(-22, 15, 0, 15);
        airBg(-21, 15, -20, 19);
        airBg(0, 14, 0, 14);

        // === 3 cells 在 (-1~0, 14-15) — level_1777651636433 ===
        airBg(-1, 15, 0, 15);
        airBg(0, 14, 0, 14);

        // === level_1777654256180 — 修补 (只留 spawn 区内的几行) ===
        wallRange(-28, 19, -28, 19);
        airBg(-22, 13, -22, 14);
        airBg(-21, 14, -21, 14);

        // ════════════════════════════════════════════════════════════
        //  SZ5: zone2+ 地形 / boss 房 / 平台 / KeyDoor / chests / hints / NPC 全部删除
        //  只保留 spawn 区地形 (上面 3 个 level_ 注释段). 后续要做 SZ5 内容直接加在这里.
        // ════════════════════════════════════════════════════════════

    }

    /**
     * 删除 spawn (zone1) + boss (zone2) 以外的 wall / bg / skin.
     * 仅清理初始 create() loop 创建的 buffer (level data 源码已经删了).
     */
    _sealNonSpawnBossArea() {
        const G = 32;
        const inSpawnBoss = (cx, cy) => cx >= -30 && cx <= 40 && cy >= 8 && cy <= 25;

        // Walls
        let wallsDestroyed = 0;
        if (this.walls && this.walls.getChildren) {
            this.walls.getChildren().slice().forEach(w => {
                const cx = Math.floor(w.x / G), cy = Math.floor(w.y / G);
                if (!inSpawnBoss(cx, cy)) {
                    try { w.destroy(); } catch(e) {}
                    wallsDestroyed++;
                }
            });
        }

        // wallRects
        if (this.wallRects) {
            this.wallRects = this.wallRects.filter(rect => {
                const cx = Math.floor((rect.x + rect.width / 2) / G);
                const cy = Math.floor((rect.y + rect.height / 2) / G);
                return inSpawnBoss(cx, cy);
            });
        }

        // Cavetile skins + BackgroundBlocks (一次 children loop 搞定)
        let skinsDestroyed = 0, bgDestroyed = 0;
        this.children.list.slice().forEach(c => {
            if (!c) return;
            const cx = Math.floor(c.x / G), cy = Math.floor(c.y / G);
            if (inSpawnBoss(cx, cy)) return;
            // Cavetile skin
            if (c.depth === -5 && c.texture && c.texture.key && c.texture.key.startsWith('Cavetile_')) {
                try { c.destroy(); } catch(e) {}
                skinsDestroyed++;
                return;
            }
            // BackgroundBlock
            if (c._isBackgroundBlock) {
                try { c.destroy(); } catch(e) {}
                bgDestroyed++;
            }
        });

        // gridSystem 标外面为 AIR
        if (this.gridSystem && typeof GridSystem !== 'undefined') {
            for (let c = -39; c <= 139; c++) {
                for (let r = -75; r <= 72; r++) {
                    if (!inSpawnBoss(c, r)) {
                        this.gridSystem.markRect(c * G + G/2, r * G + G/2, G, G, GridSystem.AIR);
                    }
                }
            }
        }

        // console.log(`[SZ5 Seal] walls: -${wallsDestroyed}, skins: -${skinsDestroyed}, bg: -${bgDestroyed}`);   // (用户) 诊断日志静默
    }
}