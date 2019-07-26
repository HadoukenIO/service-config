export async function delay(milliseconds: number) {
    return new Promise<void>(r => setTimeout(r, milliseconds));
}

export enum Duration {
    /**
     * Store has a small non blocking delay when handling window & app events
     */
    STORE_LOADING = 10
}
