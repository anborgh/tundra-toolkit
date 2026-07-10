import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { Stickers } from './stickers';
import { Templates } from './templates';
import { IgnoreList } from './ignoreList';
import showIcon from './assets/show.svg';
import hideIcon from './assets/hide.svg';
import settingsIcon from './assets/settings.svg';

import '../chota.min.css';
import '../common.css';
import './popup.css';

const sendMessageToActiveTab = (message: any) => new Promise<any>((resolve, reject) => {
  chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => {
    const tabId = tabs?.[0]?.id;
    if (!tabId) {
      reject(new Error('active_tab_not_found'));
      return;
    }

    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(response);
    });
  });
});

export function App() {
  const [ activeTab, setActiveTab ] = useState<'stickers' | 'templates' | 'ignore'>('stickers');
  const [ availability, setAvailability ] = useState<'unknown' | 'available' | 'unavailable'>('unknown');
  const [ boardId, setBoardId ] = useState<string | null>(null);
  const [ controlsVisible, setControlsVisible ] = useState(true);
  const [ visibilityMap, setVisibilityMap ] = useState<Record<string, boolean>>({});
  const [ toggling, setToggling ] = useState(false);

  useEffect(() => {
    const loadContext = async () => {
      try {
        const [ availabilityResp, forumResp, storage ] = await Promise.all([
          sendMessageToActiveTab({ type: 'tundra_toolkit_availability_ping' }).catch(() => null),
          sendMessageToActiveTab({ type: 'tundra_toolkit_forum_info' }).catch(() => null),
          chrome.storage.local.get([ 'controlsVisibilityByBoard' ]).catch(() => ({})),
        ]);

        const forumData = forumResp?.forumData;
        const board = forumData?.boardID ? `${ forumData.boardID }` : null;
        setBoardId(board);

        const computedAvailable = availabilityResp?.available ?? false;
        const fallbackAvailable = board ? true : false;
        setAvailability(computedAvailable || fallbackAvailable ? 'available' : 'unavailable');

        const storedMap: Record<string, boolean> = ((storage as any)?.controlsVisibilityByBoard as Record<string, boolean> | undefined) || {};
        setVisibilityMap(storedMap);
        if (board) {
          setControlsVisible(storedMap[board] !== false);
        }
      } catch (e) {
        setAvailability('unavailable');
      }
    };

    loadContext();
  }, []);

  const handleToggleControls = async () => {
    if (!boardId || availability !== 'available') return;
    const nextVisible = !controlsVisible;
    setControlsVisible(nextVisible);
    setToggling(true);
    try {
      const nextMap = { ...visibilityMap, [boardId]: nextVisible };
      setVisibilityMap(nextMap);
      await chrome.storage.local.set({ controlsVisibilityByBoard: nextMap });
      await sendMessageToActiveTab({
        type: 'tundra_toolkit_controls_toggle',
        boardID: boardId,
        visible: nextVisible,
      });
    } catch (e) {
      // ignore popup errors; user can retry
    } finally {
      setToggling(false);
    }
  };

  const controlsToggleLabel = controlsVisible ? 'Скрыть элементы' : 'Показать элементы';
  const toggleDisabled = availability !== 'available' || !boardId || toggling;
  const toggleIcon = controlsVisible ? hideIcon : showIcon;

  const handleOpenOptions = () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options.html'));
    }
  };

  return (
    <div class="popupWrapper">
      <div class="popupTabs">
        <button
          class={ `button small ${ activeTab === 'stickers' ? 'primary' : '' }` }
          onClick={ () => setActiveTab('stickers') }
        >
          Стикеры
        </button>
        <button
          class={ `button small ${ activeTab === 'templates' ? 'primary' : '' }` }
          onClick={ () => setActiveTab('templates') }
        >
          Черновики
        </button>
        <button
          class={ `button small ${ activeTab === 'ignore' ? 'primary' : '' }` }
          onClick={ () => setActiveTab('ignore') }
        >
          Игнор-лист
        </button>
        <button
          class={ `button small controlsToggle ${ !controlsVisible ? 'muted' : '' }` }
          onClick={ handleToggleControls }
          disabled={ toggleDisabled }
          aria-label={ controlsToggleLabel }
          title={ availability !== 'available'
            ? 'Доступно только на форумах mybb&co'
            : controlsToggleLabel
          }
        >
          <span class="controlsToggleContent">
            <img src={ toggleIcon } alt="" class="controlsToggleIcon" />
          </span>
        </button>
        <button
          class="button small controlsSettings"
          onClick={ handleOpenOptions }
          title="Настройки"
          aria-label="Настройки"
        >
          <span class="controlsSettingsContent">
            <img src={ settingsIcon } alt="" class="controlsSettingsIcon" />
          </span>
        </button>
      </div>

      <div class="popupTabContent">
        { activeTab === 'templates' && <Templates /> }
        { activeTab === 'stickers' && <Stickers /> }
        { activeTab === 'ignore' && <IgnoreList /> }
      </div>
    </div>
  );
}

render(<App />, document.getElementById('app'));
