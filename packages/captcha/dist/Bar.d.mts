declare class Bar {
    private width;
    private height;
    private successColor;
    private bar;
    private text;
    private mask;
    private slider;
    constructor(width: number, height: number);
    get elmBar(): HTMLElement;
    get elmSlider(): HTMLElement;
    get elmMask(): HTMLElement;
    createBar(): void;
    createText(): void;
    createMask(): void;
    createSlider(): void;
    render(elm: HTMLElement): void;
}

export { Bar };
