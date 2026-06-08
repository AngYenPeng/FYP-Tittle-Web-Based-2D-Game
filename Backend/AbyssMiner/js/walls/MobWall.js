/**
 * MobWall — Mob 透明墙
 * 物理上是 staticBody，但只与 Mob 碰撞（不与玩家碰撞）
 * 用法：new MobWall(scene, x, y, w, h)
 */
class MobWall {
    constructor(scene, x, y, w, h) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;

        // 透明 rectangle
        this.rect = scene.add.rectangle(x, y, w, h, 0, 0);  // alpha 0
        scene.physics.add.existing(this.rect, true);  // static body
        this.rect._isMobWall = true;

        // 加进 mobWalls group
        // (用户) 场景重启崩溃根因: Phaser Group.destroy 后 children = undefined, 但 scene.mobWalls 字段还在 —
        // 旧守卫 if (!scene.mobWalls) 第二轮判真跳过重建, 往死组 add → children.set 炸 (reading 'set' of undefined).
        // 死组检测: 不存在 或 children 已空 都重建.
        if (!scene.mobWalls || !scene.mobWalls.children) {
            scene.mobWalls = scene.physics.add.staticGroup();
        }
        scene.mobWalls.add(this.rect);
    }
}