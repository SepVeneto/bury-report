type FunCallback<T> = (result: T) => void;
type Options = {
    width: number;
    height: number;
    background: string;
    block: string;
    onFinish: FunCallback<number>;
};
declare class Jigsaw {
    private wrapper;
    private backgroundImgUrl;
    private blockImgUrl;
    private onFinish;
    private width;
    private height;
    private bar;
    private startPos;
    private blockImg;
    constructor(options: Options);
    createWrapper(): Promise<void>;
    render(elm: string | HTMLElement): Promise<void>;
    private loadImage;
    onDragStart(evt: MouseEvent): void;
    onDragMove(evt: MouseEvent): void;
    onDragEnd(): void;
}

export { Jigsaw };
