export const isMotionApiLabEnabled = (): boolean => __MOTIONOPS_ENABLE_API_LAB__;

export const canOpenMotionApiLab = (enabled = isMotionApiLabEnabled()): boolean => enabled;
