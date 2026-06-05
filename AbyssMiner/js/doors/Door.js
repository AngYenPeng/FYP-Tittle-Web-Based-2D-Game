/**
 * Door — 门基类
 *
 * 所有需要击碎/解锁/钥匙打开的"门类"对象的基类。
 *
 * 子类：
 *  - StoneRubble: 击 N 下破坏（近战）
 *  - CrystalDoor: 消耗水晶打开（E 键）
 *  - KeyDoor    : 用钥匙打开（E 键，需要钥匙物品）
 *
 * 共同行为：
 *  - 加入 walls staticGroup（碰撞）+ wallRects（射线）
 *  - 打开后视觉变半透明（但仍可见）+ 移除碰撞
 *  - 监听器接口：opened、x、y、w、h
 */
class Door {
    constructor(scene, x, y, w, h, fillColor, strokeColor) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.opened = false;

        this.rect = scene.add.rectangle(x, y, w, h, fillColor);
        if (strokeColor !== undefined) {
            this.rect.setStrokeStyle(2, strokeColor);
        }
        scene.walls.add(this.rect);
        scene.wallRects.push(new Phaser.Geom.Rectangle(x - w / 2, y - h / 2, w, h));

        // 标记 grid 为 DOOR（fog 视为阻挡）
        if (scene.gridSystem) {
            scene.gridSystem.markRect(x, y, w, h, GridSystem.DOOR);
        }
    }

    /** 标记打开（仅 opened 标志），子类决定何时调用 _finalizeOpen 移除碰撞 */
    open() {
        if (this.opened) return;
        this.opened = true;
        // 默认行为：立刻 finalize（旧行为），子类如果有动画就重写 open() 不调 finalize
        this._finalizeOpen();
    }

    /** 真正移除碰撞 + 标记 grid 为 AIR（动画结束时才调用）*/
    _finalizeOpen() {
        if (this._finalized) return;
        this._finalized = true;

        if (this.rect) {
            this.rect.setAlpha(0);  // 完全隐藏（不留半透明）
            if (this.rect.body) {
                this.rect.body.enable = false;
            }
            if (this.scene.walls) {
                this.scene.walls.remove(this.rect);
            }
        }
        // 标记 grid 为 AIR（fog 不再阻挡，可传播）
        if (this.scene.gridSystem) {
            this.scene.gridSystem.unmarkRect(this.x, this.y, this.w, this.h);
        }
        if (this.scene._rebuildWallRects) {
            this.scene._rebuildWallRects();
        }
    }
}