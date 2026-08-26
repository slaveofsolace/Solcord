const {
    __claimSolcordTimelineBootstrap: claimSolcordTimelineBootstrap,
    ...RemoteAPI
} = window.BetterDiscordPreload();

export {claimSolcordTimelineBootstrap};
export default RemoteAPI;
