export type SettingsSection = 'stickers' | 'templates' | 'blackList' | 'favorites' | 'guide';

export const DEFAULT_SETTINGS_SECTION: SettingsSection = 'stickers';

const SETTINGS_SECTIONS: SettingsSection[] = [ 'stickers', 'templates', 'blackList', 'favorites', 'guide' ];

export const isSettingsSection = (value: string | null | undefined): value is SettingsSection =>
  !!value && SETTINGS_SECTIONS.includes(value as SettingsSection);

export const getSettingsSectionUrl = (section?: SettingsSection) =>
  chrome.runtime.getURL(section ? `options.html#${ section }` : 'options.html');

export const openSettingsSection = (section?: SettingsSection) => {
  if (!section) {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
      return;
    }
    window.open(getSettingsSectionUrl());
    return;
  }

  window.open(getSettingsSectionUrl(section));
};
