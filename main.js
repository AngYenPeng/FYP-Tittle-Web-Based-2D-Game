class MainGameScene extends Phaser.Scene {
    constructor() {
        super('MainGameScene');
        // ==========================================
        // 1. 基础蓄力与状态
        // ==========================================
        this.chargeTime = 0;
        this.isCharging = false;
        this.maxChargeThreshold = 750; 
        
        this.isGrappling = false; 
        this.activeGrapplePick = null; 
        
        // ==========================================
        // 2. 核心物理参数
        // ==========================================
        this.WARNING_DISTANCE = 400;   // 均分变红线
        this.HEAVY_FLY_LIMIT = 500;    // 重投极限
        this.CRITICAL_DISTANCE = 600;  // 均分强制拉人线
        this.RETRACT_DELAY = 1000;     

        // ==========================================
        // 3. 冲刺系统 (80ms极速, 2400速度)
        // ==========================================
        this.lastDashTime = 0;        
        this.dashCooldown = 0;        
        this.isDashing = false;       
        this.dashDuration = 80;      
        this.dashSpeed = 2400;         
        this.doubleTapThreshold = 250; 
        this.lastAPressTime = 0;      
        this.lastDPressTime = 0;      

        // ==========================================
        // 4. 定制 Verlet 绳索引擎数据
        // ==========================================
        this.ropeNodes1 = []; 
        this.ropeNodes2 = []; 
        this.ropeLength1 = 0;
        this.ropeLength2 = 0;
        this.wallRects = []; 
        
        this.activeStart1 = 0; this.activeEnd1 = 34;
        this.activeStart2 = 0; this.activeEnd2 = 34;

        this.dropTimer1 = null;  
        this.dropTimer2 = null;
        this.retractTimer1 = null; 
        this.retractTimer2 = null;
    }

    preload() {
        let gfx = this.add.graphics();
        gfx.fillStyle(0xffffff).fillRect(0, 0, 32, 48);
        gfx.generateTexture('player_img', 32, 48);
        
        gfx.clear().fillStyle(0xffff00).fillRect(0, 0, 16, 16);
        gfx.generateTexture('pickaxe_img', 16, 16);
        
        gfx.clear().lineStyle(3, 0xffffff).arc(15, 15, 12, 0, Math.PI * 2).strokePath();
        gfx.lineStyle(2, 0xffffff).lineBetween(15, 3, 15, 27).lineBetween(3, 15, 27, 15);
        gfx.generateTexture('crosshair_custom', 30, 30);
        
        gfx.clear().fillStyle(0xffffff).fillRect(0, 0, 10, 14);
        gfx.fillStyle(0x000000).fillRect(2, 2, 6, 2).fillRect(2, 6, 6, 2);
        gfx.generateTexture('left_hand_icon', 10, 14);
        
        gfx.clear().fillStyle(0xffffff).fillRect(0, 0, 10, 14);
        gfx.fillStyle(0x000000).fillRect(2, 2, 6, 2).fillRect(2, 6, 6, 2).fillRect(2, 10, 6, 2);
        gfx.generateTexture('right_hand_icon', 10, 14);
        gfx.destroy();
    }

    create() {
        this.input.mouse.disableContextMenu();

        this.walls = this.physics.add.staticGroup();
        
        // ==========================================
        // 【地形】阶梯拔高1/3、向外拉远，平台降至4/5
        // ==========================================
        this.createWall(800, 880, 1600, 40); // 地板
        this.createWall(800, 20, 1600, 40);  // 天花板
        this.createWall(20, 450, 40, 900);   // 左墙
        this.createWall(1580, 450, 40, 900); // 右墙
        
        this.createWall(800, 540, 400, 40);  // 中央悬空平台

        this.createWall(150, 820, 60, 80);   // 左阶梯1
        this.createWall(210, 780, 60, 160);  // 左阶梯2
        this.createWall(270, 740, 60, 240);  // 左阶梯3

        this.createWall(1330, 740, 60, 240); // 右阶梯1
        this.createWall(1390, 780, 60, 160); // 右阶梯2
        this.createWall(1450, 820, 60, 80);  // 右阶梯3

        this.player = new Player(this, 800, 250);
        this.physics.add.collider(this.player, this.walls);
        this.player.body.setMaxVelocity(3000, 3000);

        this.inv = { left: true, right: true };
        this.pick1 = new Pickaxe(this, 0, 0); 
        this.pick2 = new Pickaxe(this, 0, 0);
        this.pick1.setCollideWorldBounds(true);
        this.pick2.setCollideWorldBounds(true);

        this.physics.add.collider(this.pick1, this.walls, () => this.handlePickCollide(this.pick1, 1));
        this.physics.add.collider(this.pick2, this.walls, () => this.handlePickCollide(this.pick2, 2));

        for (let i = 0; i < 35; i++) {
            this.ropeNodes1.push({ x: 0, y: 0, ox: 0, oy: 0 });
            this.ropeNodes2.push({ x: 0, y: 0, ox: 0, oy: 0 });
        }

        this.physics.add.overlap(this.player, [this.pick1, this.pick2], (p, pick) => {
            if (pick.state === 'dropped' || pick.state === 'returning') this.doCollect(pick);
        });

        this.ropeGraphics = this.add.graphics().setDepth(2);
        this.crosshair = this.add.sprite(0, 0, 'crosshair_custom').setDepth(100).setTint(0xffff00);
        this.leftHandIndicator = this.add.sprite(0, 0, 'left_hand_icon').setDepth(100).setVisible(false);
        this.rightHandIndicator = this.add.sprite(0, 0, 'right_hand_icon').setDepth(100).setVisible(false);

        // --- 鼠标交互 ---
        this.input.on('pointerdown', (pointer) => {
            if (!this.player.body) return;
            let side = this.player.pState.activeHand;
            let pick = (side === 'left') ? this.pick1 : this.pick2;

            if (pointer.button === 2) { 
                if (pick.state !== 'idle') {
                    if (pick.state === 'attached') {
                        this.startZip(pick); 
                    } else if (pick.state !== 'returning' && pick.state !== 'pre_returning' && pick.state !== 'pre_zipping') {
                        this.startRecall(pick); 
                    }
                }
                if (!this.isCharging) {
                    this.isCharging = true;
                    this.chargeTime = 0;
                }
            } else if (pointer.button === 0 && this.isCharging && this.chargeTime >= this.maxChargeThreshold) {
                this.releaseThrow(pointer, true); 
            }
        });
        
        this.input.on('pointerup', (p) => { 
            if (p.button === 2 && this.isCharging) this.releaseThrow(p, false); 
        });
    }

    createWall(x, y, width, height) {
        let wall = this.add.rectangle(x, y, width, height, 0x555555);
        this.walls.add(wall);
        this.wallRects.push(new Phaser.Geom.Rectangle(x - width/2, y - height/2, width, height));
    }

    resolvePickWallCollision(pick) {
        let radius = 8;
        for (let w of this.wallRects) {
            let cx = Phaser.Math.Clamp(pick.x, w.left, w.right);
            let cy = Phaser.Math.Clamp(pick.y, w.top, w.bottom);
            let dx = pick.x - cx;
            let dy = pick.y - cy;
            let distSq = dx * dx + dy * dy;
            
            if (distSq < radius * radius) {
                let dist = Math.sqrt(distSq);
                if (dist === 0) { 
                    if (pick.body.preX <= w.left) pick.x = w.left - radius;
                    else if (pick.body.preX >= w.right) pick.x = w.right + radius;
                    else if (pick.body.preY <= w.top) pick.y = w.top - radius;
                    else if (pick.body.preY >= w.bottom) pick.y = w.bottom + radius;
                } else {
                    let overlap = radius - dist;
                    pick.x += (dx / dist) * overlap;
                    pick.y += (dy / dist) * overlap;
                }
            }
        }
    }

    handlePickCollide(pick, id) {
        if (!pick.body) return;
        let dropTimerKey = (id === 1) ? 'dropTimer1' : 'dropTimer2';

        if (pick.state === 'flying_max' || pick.state === 'flying_gravity' || pick.state === 'dropping') {
            this.resolvePickWallCollision(pick);

            if (pick.isHeavy) {
                pick.state = 'attached';
                pick.justAttached = true;
                pick.ignoreZipFrames = 5; 
                
                pick.body.setVelocity(0, 0); 
                pick.body.setAllowGravity(false); 
                pick.clearTint(); 
                if (this[dropTimerKey]) { this[dropTimerKey].remove(); this[dropTimerKey] = null; }
            } else {
                if (pick.state === 'dropping') {
                    if (!pick.hasBounced) {
                        pick.hasBounced = true;
                        pick.body.setVelocityY(-400); 
                        this.time.delayedCall(200, () => { if(pick.state === 'dropping') this.startRecall(pick); });
                    }
                } else {
                    this.startRecall(pick); 
                }
            }
        }
    }

    executeDash(direction) {
        if (!this.player.body) return;
        let now = this.time.now;
        if (this.dashCooldown > 0) return;

        let interval = (now - this.lastDashTime) / 1000;
        this.dashCooldown = (0.3 + Math.max(0, 0.9 - interval)) * 1000;
        
        this.isDashing = true;
        this.lastDashTime = now;
        this.player.setVelocityX(direction === 'left' ? -this.dashSpeed : this.dashSpeed);
        this.player.body.setAllowGravity(false);
        this.player.setVelocityY(0);

        this.time.delayedCall(this.dashDuration, () => {
            if (this.player && this.player.body) {
                this.isDashing = false;
                if (!this.isGrappling) this.player.body.setAllowGravity(true);
            }
        });
    }

    calculateActualRopeLength(pick, aStart, aEnd) {
        let nodes = (pick === this.pick1) ? this.ropeNodes1 : this.ropeNodes2;
        let total = 0;
        let prevX = this.player.x, prevY = this.player.y;
        if (aStart <= aEnd) {
            for (let i = aStart; i <= aEnd; i++) {
                total += Phaser.Math.Distance.Between(prevX, prevY, nodes[i].x, nodes[i].y);
                prevX = nodes[i].x; prevY = nodes[i].y;
            }
        }
        total += Phaser.Math.Distance.Between(prevX, prevY, pick.x, pick.y);
        return total;
    }

    startZip(pick) {
        if (!this.player.body) return;
        if (pick.state === 'pre_zipping' || pick.state === 'pre_returning' || pick.state === 'returning') return;

        pick.state = 'pre_zipping'; 
        let ropeKey = (pick === this.pick1) ? 'ropeLength1' : 'ropeLength2';
        let aStart = (pick === this.pick1) ? this.activeStart1 : this.activeStart2;
        let aEnd = (pick === this.pick1) ? this.activeEnd1 : this.activeEnd2;
        this[ropeKey] = this.calculateActualRopeLength(pick, aStart, aEnd);

        if (pick === this.pick1 && this.retractTimer1) { this.retractTimer1.remove(); this.retractTimer1 = null; }
        if (pick === this.pick2 && this.retractTimer2) { this.retractTimer2.remove(); this.retractTimer2 = null; }

        this.time.delayedCall(180, () => {
            if (pick.state === 'pre_zipping') {
                pick.state = 'attached'; 
                this.isGrappling = true;
                this.activeGrapplePick = pick;
                this.player.body.setAllowGravity(false);
                this.player.body.checkCollision.none = true; 
            }
        });
    }

    startRecall(pick) {
        if (pick.state === 'returning' || pick.state === 'idle' || pick.state === 'pre_returning' || pick.state === 'pre_zipping') return;
        
        pick.state = 'pre_returning'; 
        pick.body.setVelocity(0, 0); 
        pick.body.setAllowGravity(false);

        let ropeKey = (pick === this.pick1) ? 'ropeLength1' : 'ropeLength2';
        let aStart = (pick === this.pick1) ? this.activeStart1 : this.activeStart2;
        let aEnd = (pick === this.pick1) ? this.activeEnd1 : this.activeEnd2;
        this[ropeKey] = this.calculateActualRopeLength(pick, aStart, aEnd);

        this.time.delayedCall(180, () => {
            if (pick.state === 'pre_returning') {
                pick.state = 'returning';
                pick.body.checkCollision.none = true; 
            }
        });
    }

    update(time, delta) {
        if (!this.player.body) return; 

        if (this.dashCooldown > 0) this.dashCooldown -= delta;

        this.crosshair.setPosition(this.input.activePointer.worldX, this.input.activePointer.worldY);
        this.leftHandIndicator.setPosition(this.crosshair.x - 22, this.crosshair.y);
        this.rightHandIndicator.setPosition(this.crosshair.x + 22, this.crosshair.y);

        if (Phaser.Input.Keyboard.JustDown(this.player.keys.left)) {
            if (time - this.lastAPressTime < this.doubleTapThreshold) this.executeDash('left');
            this.lastAPressTime = time;
        }
        if (Phaser.Input.Keyboard.JustDown(this.player.keys.right)) {
            if (time - this.lastDPressTime < this.doubleTapThreshold) this.executeDash('right');
            this.lastDPressTime = time;
        }

        if (!this.isDashing) {
            this.player.update(time, delta);
        }

        this.ropeGraphics.clear(); 

        [this.pick1, this.pick2].forEach((p, index) => {
            if (!p.body) return;
            let limit = p.isHeavy ? this.HEAVY_FLY_LIMIT : this.WARNING_DISTANCE;
            let ropeKey = (index === 0) ? 'ropeLength1' : 'ropeLength2';
            let dropTimerKey = (index === 0) ? 'dropTimer1' : 'dropTimer2';
            let retractTimerKey = (index === 0) ? 'retractTimer1' : 'retractTimer2';
            let nodes = (index === 0) ? this.ropeNodes1 : this.ropeNodes2;
            let aStart = (index === 0) ? this.activeStart1 : this.activeStart2;
            let aEnd = (index === 0) ? this.activeEnd1 : this.activeEnd2;

            let isPreReturning = (p.state === 'pre_returning');
            let isPreZipping = (p.state === 'pre_zipping');
            let isReturning = (p.state === 'returning');
            let isZipping = (this.isGrappling && this.activeGrapplePick === p);

            let straightDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y);
            
            // ==========================================
            // 【3倍极速绷紧】：从 15000 暴增到 45000！
            // 极具视觉爆发力的一瞬间绷紧钢索！
            // ==========================================
            if (isPreReturning || isPreZipping) {
                this[ropeKey] = Math.max(straightDist, this[ropeKey] - 45000 * (delta / 1000));
            } else if (isReturning || isZipping) {
                this[ropeKey] = this.calculateActualRopeLength(p, aStart, aEnd); 
            } else {
                
                if (p.state === 'attached' || p.state === 'dropping') {
                    let actualDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y);
                    if (actualDist > this[ropeKey]) {
                        this[ropeKey] = actualDist; 
                    } else if (p.state === 'attached' && this[ropeKey] > actualDist) {
                        this[ropeKey] = Math.max(actualDist, this[ropeKey] - 2000 * (delta / 1000));
                    }
                }

                if ((p.state === 'flying_max' || p.state === 'flying_gravity') && straightDist > limit) {
                    p.state = 'dropping';
                    this[ropeKey] = limit;
                    p.body.setAllowGravity(true);
                    
                    p.body.velocity.x *= 0.3;
                    if (p.body.velocity.y < 0) {
                        p.body.velocity.y = 0; 
                    }
                    p.hasBounced = false;

                    if (p.isHeavy) {
                        this[dropTimerKey] = this.time.delayedCall(3000, () => {
                            if(p.state === 'dropping' || p.state === 'attached') this.startRecall(p);
                        });
                    } else {
                        this[dropTimerKey] = this.time.delayedCall(500, () => {
                            if(p.state === 'dropping') this.startRecall(p);
                        });
                    }
                }

                if (p.state === 'dropping') {
                    let currentMax = limit; 
                    let actualLen = this.calculateActualRopeLength(p, aStart, aEnd);
                    
                    if (actualLen > currentMax) {
                        let anchorX = (aStart <= aEnd) ? nodes[aEnd].x : this.player.x;
                        let anchorY = (aStart <= aEnd) ? nodes[aEnd].y : this.player.y;
                        let pullAngle = Phaser.Math.Angle.Between(anchorX, anchorY, p.x, p.y);
                        
                        let overreach = actualLen - currentMax;
                        let distToAnchor = Phaser.Math.Distance.Between(anchorX, anchorY, p.x, p.y);
                        
                        if (overreach > distToAnchor * 0.8) {
                            overreach = distToAnchor * 0.8;
                        }

                        p.x -= Math.cos(pullAngle) * overreach * 0.2;
                        p.y -= Math.sin(pullAngle) * overreach * 0.2;

                        let vx = p.body.velocity.x;
                        let vy = p.body.velocity.y;
                        let nx = Math.cos(pullAngle);
                        let ny = Math.sin(pullAngle);
                        let dot = vx * nx + vy * ny; 
                        
                        if (dot > 0) { 
                            p.body.velocity.x -= dot * nx;
                            p.body.velocity.y -= dot * ny;
                        }
                        
                        p.body.velocity.x *= 0.99;
                        p.body.velocity.y *= 0.99;
                    }
                }
            }

            let maxSegDist = this.processVerletRope(p, index);

            if (p.state === 'attached' && !this.isGrappling) {
                let actualLen = this.calculateActualRopeLength(p, aStart, aEnd);
                
                if (p.ignoreZipFrames && p.ignoreZipFrames > 0) {
                    p.ignoreZipFrames--;
                } else {
                    let warningPerSeg = this.WARNING_DISTANCE / 36;
                    let criticalPerSeg = this.CRITICAL_DISTANCE / 36;

                    if (maxSegDist > criticalPerSeg && actualLen > this.CRITICAL_DISTANCE * 0.8 && straightDist > this.CRITICAL_DISTANCE * 0.4) {
                        this.startZip(p); 
                    } else if (maxSegDist > warningPerSeg && actualLen > this.WARNING_DISTANCE * 0.8 && straightDist > this.WARNING_DISTANCE * 0.4) {
                        p.setTint(0xff0000); 
                        if (!this[retractTimerKey]) {
                            this[retractTimerKey] = this.time.delayedCall(this.RETRACT_DELAY, () => {
                                if (p.state === 'attached') this.startZip(p);
                                this[retractTimerKey] = null;
                            });
                        }
                    } else {
                        p.clearTint(); 
                        if (this[retractTimerKey]) { this[retractTimerKey].remove(); this[retractTimerKey] = null; }
                    }
                }
            } else if (p.state === 'dropping') {
                if (maxSegDist > this.WARNING_DISTANCE / 36) p.setTint(0xff0000);
                else p.clearTint();
            }
        });

        // 0.6倍速度前瞻飞行，幽灵穿梭防撞停
        if (this.isGrappling && this.activeGrapplePick) {
            let pPick = this.activeGrapplePick;
            let nodes = (pPick === this.pick1) ? this.ropeNodes1 : this.ropeNodes2;
            let targetNode = pPick; 
            let myDistToGoal = Phaser.Math.Distance.Between(this.player.x, this.player.y, pPick.x, pPick.y);
            
            for (let i = 0; i < 35; i++) {
                let nodeDistToGoal = Phaser.Math.Distance.Between(nodes[i].x, nodes[i].y, pPick.x, pPick.y);
                let distToMe = Phaser.Math.Distance.Between(this.player.x, this.player.y, nodes[i].x, nodes[i].y);
                if (distToMe > 40 && nodeDistToGoal < myDistToGoal) {
                    targetNode = nodes[i];
                    break;
                }
            }
            
            let angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, targetNode.x, targetNode.y);
            this.player.body.setVelocity(Math.cos(angle) * 1440, Math.sin(angle) * 1440);
            
            if (myDistToGoal <= 65) {
                this.stopGrapple();
            }
        }

        [this.pick1, this.pick2].forEach((p, idx) => {
            if (p.state === 'returning') {
                let nodes = (idx === 0) ? this.ropeNodes1 : this.ropeNodes2;
                let targetNode = this.player; 
                let myDistToGoal = Phaser.Math.Distance.Between(p.x, p.y, this.player.x, this.player.y);
                
                for (let i = 34; i >= 0; i--) {
                    let nodeDistToGoal = Phaser.Math.Distance.Between(nodes[i].x, nodes[i].y, this.player.x, this.player.y);
                    let distToMe = Phaser.Math.Distance.Between(p.x, p.y, nodes[i].x, nodes[i].y);
                    if (distToMe > 40 && nodeDistToGoal < myDistToGoal) {
                        targetNode = nodes[i];
                        break;
                    }
                }
                
                let angle = Phaser.Math.Angle.Between(p.x, p.y, targetNode.x, targetNode.y);
                p.body.setVelocity(Math.cos(angle) * 1560, Math.sin(angle) * 1560);
            }
            
            if ((p.state === 'returning' || p.state === 'dropped') && Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y) <= 65) {
                this.doCollect(p);
            }
        });

        this.handleCharge(delta);
    }

    resolveVerletWallCollision(s) {
        let radius = 24; 
        for (let w of this.wallRects) {
            let cx = Phaser.Math.Clamp(s.x, w.left, w.right);
            let cy = Phaser.Math.Clamp(s.y, w.top, w.bottom);
            let dx = s.x - cx;
            let dy = s.y - cy;
            let distSq = dx * dx + dy * dy;
            
            if (distSq < radius * radius) {
                let dist = Math.sqrt(distSq);
                if (dist === 0) dist = 0.001;
                let overlap = radius - dist;
                s.x += (dx / dist) * overlap;
                s.y += (dy / dist) * overlap;
            }
        }
    }

    constrainVerlet(p1, p2, targetDist, isP1Fixed, isP2Fixed) {
        let dx = p2.x - p1.x;
        let dy = p2.y - p1.y;
        let dist = Math.sqrt(dx*dx + dy*dy);
        if (dist === 0) return;
        
        let diff = dist - targetDist;
        if (diff < 0) return; 

        let percent = (diff / dist) * 1.0; 
        let offsetX = dx * percent * 0.5;
        let offsetY = dy * percent * 0.5;

        if (!isP1Fixed && !isP2Fixed) {
            p1.x += offsetX; p1.y += offsetY;
            p2.x -= offsetX; p2.y -= offsetY;
        } else if (isP1Fixed && !isP2Fixed) {
            p2.x -= offsetX * 2; p2.y -= offsetY * 2;
        } else if (!isP1Fixed && isP2Fixed) {
            p1.x += offsetX * 2; p1.y += offsetY * 2;
        }
    }

    processVerletRope(pick, id) {
        let nodes = (id === 0) ? this.ropeNodes1 : this.ropeNodes2;
        if (pick.state === 'idle') return 0;

        let aStart = (id === 0) ? this.activeStart1 : this.activeStart2;
        let aEnd = (id === 0) ? this.activeEnd1 : this.activeEnd2;

        let ropeKey = (id === 0) ? 'ropeLength1' : 'ropeLength2';
        
        if (pick.state === 'flying_max' || pick.state === 'flying_gravity') {
            this[ropeKey] = Phaser.Math.Distance.Between(this.player.x, this.player.y, pick.x, pick.y);
        }
        
        let maxLen = this[ropeKey];
        if (!maxLen || maxLen === 0) maxLen = 10; 
        
        let numActiveSegments = (aStart <= aEnd) ? (aEnd - aStart + 2) : 1;
        let restLen = maxLen / numActiveSegments; 
        
        let isPreState = (pick.state === 'pre_zipping' || pick.state === 'pre_returning');
        let isZipping = (this.isGrappling && this.activeGrapplePick === pick);
        let isReturning = (pick.state === 'returning');
        let isSimulating = (pick.state === 'dropping' || pick.state === 'attached' || isReturning || isPreState || isZipping);
        
        if (isSimulating) {
            for (let i = aStart; i <= aEnd; i++) {
                let n = nodes[i];
                let vx = (n.x - n.ox) * 0.95; 
                let vy = (n.y - n.oy) * 0.95;
                n.ox = n.x; n.oy = n.y;
                n.x += vx; 
                
                if (!isPreState && !isReturning && !isZipping && pick.state !== 'attached') n.y += vy + 0.8; 
                else n.y += vy; 
                this.resolveVerletWallCollision(n); 
            }

            for(let iter=0; iter<30; iter++) {
                if (aStart <= aEnd) {
                    this.constrainVerlet(this.player, nodes[aStart], restLen, true, false);
                    for(let i=aStart; i<aEnd; i++) {
                        this.constrainVerlet(nodes[i], nodes[i+1], restLen, false, false);
                    }
                    let isPickFixed = (pick.state === 'attached' || isReturning || isPreState || isZipping);
                    this.constrainVerlet(nodes[aEnd], pick, restLen, false, isPickFixed);
                } else {
                    let isPickFixed = (pick.state === 'attached' || isReturning || isPreState || isZipping);
                    this.constrainVerlet(this.player, pick, restLen, true, isPickFixed);
                }

                for (let i = aStart; i <= aEnd; i++) {
                    this.resolveVerletWallCollision(nodes[i]);
                }
            }
        } else {
            nodes.forEach((n, i) => {
                let ratio = (i + 1) / 36;
                n.x = Phaser.Math.Interpolation.Linear([this.player.x, pick.x], ratio);
                n.y = Phaser.Math.Interpolation.Linear([this.player.y, pick.y], ratio);
                n.ox = n.x; n.oy = n.y;
            });
        }

        let maxD = 0;
        let prevX = this.player.x, prevY = this.player.y;
        if (aStart <= aEnd) {
            for(let i=aStart; i<=aEnd; i++) {
                let d = Phaser.Math.Distance.Between(prevX, prevY, nodes[i].x, nodes[i].y);
                if (d > maxD) maxD = d;
                prevX = nodes[i].x; prevY = nodes[i].y;
            }
        }
        let dLast = Phaser.Math.Distance.Between(prevX, prevY, pick.x, pick.y);
        if (dLast > maxD) maxD = dLast;

        let ropeColor = maxD > (this.WARNING_DISTANCE / 36) ? 0xff0000 : 0xffff00;
        
        let validNodes = [];
        for (let i = 0; i < 35; i++) {
            let skip = false;
            if (isZipping && Phaser.Math.Distance.Between(this.player.x, this.player.y, nodes[i].x, nodes[i].y) < 60) skip = true;
            if (isReturning && Phaser.Math.Distance.Between(pick.x, pick.y, nodes[i].x, nodes[i].y) < 60) skip = true;
            if (!skip) validNodes.push(nodes[i]);
        }

        this.ropeGraphics.lineStyle(2, ropeColor, 0.8);
        this.ropeGraphics.beginPath();
        this.ropeGraphics.moveTo(this.player.x, this.player.y);
        validNodes.forEach(n => this.ropeGraphics.lineTo(n.x, n.y));
        this.ropeGraphics.lineTo(pick.x, pick.y);
        this.ropeGraphics.strokePath();

        this.ropeGraphics.fillStyle(0xffffff, 1);
        this.ropeGraphics.fillCircle(this.player.x, this.player.y, 4);
        validNodes.forEach(n => this.ropeGraphics.fillCircle(n.x, n.y, 4));
        this.ropeGraphics.fillCircle(pick.x, pick.y, 4);

        return maxD; 
    }

    stopGrapple() {
        this.isGrappling = false;
        if (this.player.body) { 
            this.player.body.setAllowGravity(true); 
            this.player.body.setVelocity(0, 0); 
            this.player.body.checkCollision.none = false;
        }
        if (this.activeGrapplePick) this.doCollect(this.activeGrapplePick);
        this.activeGrapplePick = null;
    }

    handleCharge(delta) {
        let side = this.player.pState.activeHand;
        this.leftHandIndicator.setVisible(side === 'left');
        this.rightHandIndicator.setVisible(side === 'right');
        if (this.isCharging) {
            this.chargeTime += delta;
            let pct = Math.min(this.chargeTime / this.maxChargeThreshold, 1);
            let alpha = this.inv[side] ? 1 : 0.3;
            this.crosshair.setScale(1 + pct * 0.5).setAlpha(alpha).setTint(pct >= 1 ? 0xff0000 : 0xffff00);
            this.leftHandIndicator.setAlpha(alpha).setTint(this.crosshair.tintTopLeft);
            this.rightHandIndicator.setAlpha(alpha).setTint(this.crosshair.tintTopLeft);
        } else {
            this.crosshair.setScale(1).setAlpha(1).setTint(0xffff00);
        }
    }

    releaseThrow(pointer, isHeavy) {
        let side = this.player.pState.activeHand;
        if (!this.inv[side]) { 
            this.isCharging = false; 
            this.chargeTime = 0; 
            return; 
        }
        
        if (side === 'left') { this.activeStart1 = 0; this.activeEnd1 = 34; }
        else { this.activeStart2 = 0; this.activeEnd2 = 34; }

        let nodes = (side === 'left') ? this.ropeNodes1 : this.ropeNodes2;
        nodes.forEach(n => { n.x = this.player.x; n.y = this.player.y; n.ox = this.player.x; n.oy = this.player.y; });

        let pick = (side === 'left') ? this.pick1 : this.pick2;
        pick.isHeavy = isHeavy; 
        pick.body.checkCollision.none = false;
        pick.fire(this.player.x, this.player.y, pointer.worldX, pointer.worldY, 650 + (Math.min(this.chargeTime / this.maxChargeThreshold, 1) * 1150), isHeavy);
        this.inv[side] = false;
        this.isCharging = false;
        this.chargeTime = 0; 
    }

    doCollect(pick) {
        if (pick === this.pick1) { this.inv.left = true; this.ropeLength1 = 0; }
        if (pick === this.pick2) { this.inv.right = true; this.ropeLength2 = 0; }
        pick.body.checkCollision.none = false; 
        pick.backToInventory();
    }
}

const config = {
    type: Phaser.AUTO,
    width: 1600, height: 900,
    physics: { default: 'arcade', arcade: { gravity: { y: 1750 }, debug: true } },
    scene: [MainGameScene]
};
const game = new Phaser.Game(config);