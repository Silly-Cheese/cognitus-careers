// Retired.
//
// The previous implementation used a subtree MutationObserver and could react to
// its own DOM inserts, repeatedly creating application-tip elements. The live
// Talent Gateway now uses talent-gateway-final.js as the single enhancement
// controller. This file intentionally performs no runtime work so an accidental
// legacy reference cannot recreate the old loop.
