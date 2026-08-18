import { render } from 'preact';
import { useEffect, useMemo, useState } from 'react';

import { BlackListOptions } from './blackListOptions';
import StickerPackOptions from './stickerPackOptions';
import TemplateOptions from './templateOptions';
import { FavoritesOptions } from './favoritesOptions';
import { DEFAULT_SETTINGS_SECTION, isSettingsSection, SettingsSection } from '../utils/settingsSections';
import {
	getStorageFallbacks,
	isStorageKeyLocal,
	safeStoragePromoteFallbacks,
	STORAGE_FALLBACKS_KEY,
	StorageFallbackMap,
} from '../utils/storage';

import '../chota.min.css';
import '../common.css';
import './options.css';

const getSectionFromHash = (): SettingsSection => {
	const hash = window.location.hash.replace('#', '');
	return isSettingsSection(hash) ? hash : DEFAULT_SETTINGS_SECTION;
};

const SECTION_STORAGE_KEYS: Partial<Record<SettingsSection, string[]>> = {
	stickers: [ 'stickerPack' ],
	templates: [ 'templates' ],
	blackList: [ 'ignoreList', 'ignoredTopicsList' ],
	favorites: [ 'favoriteTopics' ],
};

const isSectionLocal = (
	section: SettingsSection,
	fallbacks: StorageFallbackMap,
) => {
	const keys = SECTION_STORAGE_KEYS[section];
	if (!keys?.length) return false;
	return keys.some(key => isStorageKeyLocal(fallbacks, key));
};

export function App() {
	const [ activeSection, setActiveSection ] = useState<SettingsSection>(getSectionFromHash);
	const [ syncBytesInUse, setSyncBytesInUse ] = useState<number | null>(null);
	const [ syncUsageError, setSyncUsageError ] = useState<string | null>(null);
	const [ storageFallbacks, setStorageFallbacks ] = useState<StorageFallbackMap>({});

	const syncQuotaBytes = chrome.storage?.sync?.QUOTA_BYTES || 102400;
	const syncUsagePercent = useMemo(() => {
		if (syncBytesInUse === null) return 0;
		return Math.min(100, Math.round((syncBytesInUse / syncQuotaBytes) * 100));
	}, [ syncBytesInUse, syncQuotaBytes ]);
	const activeSectionIsLocal = isSectionLocal(activeSection, storageFallbacks);

	useEffect(() => {
		const updateSyncUsage = () => {
			chrome.storage.sync.getBytesInUse(null, (bytes) => {
				if (chrome.runtime.lastError) {
					setSyncUsageError('Недоступно');
					return;
				}

				setSyncUsageError(null);
				setSyncBytesInUse(bytes || 0);
			});
		};

		const updateFallbacks = () => {
			getStorageFallbacks()
				.then(setStorageFallbacks)
				.catch(() => setStorageFallbacks({}));
		};

		const reconcileStorage = async () => {
			try {
				await safeStoragePromoteFallbacks();
			} catch (e) {
				// ignore promote errors; UI still reflects current fallbacks
			}
			updateSyncUsage();
			updateFallbacks();
		};

		reconcileStorage();

		const handleStorageChange = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
			if (areaName !== 'sync' && areaName !== 'local') return;
			updateSyncUsage();
			if (changes[STORAGE_FALLBACKS_KEY] || changes['tt2/loc']) {
				updateFallbacks();
			}
		};

		chrome.storage.onChanged.addListener(handleStorageChange);
		return () => chrome.storage.onChanged.removeListener(handleStorageChange);
	}, []);

	useEffect(() => {
		const handleHashChange = () => setActiveSection(getSectionFromHash());
		window.addEventListener('hashchange', handleHashChange);
		return () => window.removeEventListener('hashchange', handleHashChange);
	}, []);

	const selectSection = (section: SettingsSection) => {
		setActiveSection(section);
		if (window.location.hash !== `#${ section }`) {
			window.location.hash = section;
		}
	};

	const sections: {
		id: SettingsSection;
		label: string;
	}[] = [
		{ id: 'stickers', label: 'Стикеры' },
		{ id: 'templates', label: 'Черновики' },
		{ id: 'blackList', label: 'Чёрный список' },
		{ id: 'favorites', label: 'Избранное' },
	];

	const renderSection = () => {
		switch (activeSection) {
			case 'guide':
				return (
					<section className="optionsGuide">
						<h3>Инструкция по расширению</h3>
						<p className="text-secondary">
							Tundra Toolkit — расширение для форумных ролевых игр на MyBB/RusFF.
							Оно добавляет в браузер привычные инструменты: стикеры, черновики, личный игнор,
							счётчик постов и список активных эпизодов.
						</p>
						<p className="text-secondary">
							Все эти инструменты работают прямо из расширения на любом поддерживаемом форуме.
							Просить администратора установить отдельные скрипты не нужно — достаточно включить
							Tundra Toolkit в браузере. Расширение меняет страницы только у вас: другие игроки
							этого не увидят. Отдельный аккаунт не нужен.
						</p>

						<nav className="optionsGuideToc" aria-label="Содержание инструкции">
							{[
								[ 'guide-start', 'Быстрый старт' ],
								[ 'guide-episodes', 'Эпизоды' ],
								[ 'guide-stickers', 'Стикеры' ],
								[ 'guide-drafts', 'Черновики' ],
								[ 'guide-ignore', 'Игнор-лист' ],
								[ 'guide-counter', 'Счётчик постов' ],
								[ 'guide-style', 'Стиль' ],
								[ 'guide-settings', 'Настройки' ],
								[ 'guide-sync', 'Хранение' ],
								[ 'guide-faq', 'Частые вопросы' ],
							].map(([ id, label ]) => (
								<button
									key={ id }
									type="button"
									onClick={ () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
								>
									{ label }
								</button>
							)) }
						</nav>

						<div className="optionsGuideBlock" id="guide-start">
							<h5>Быстрый старт</h5>
							<ol>
								<li>Откройте нужный форум MyBB/RusFF и нажмите на значок Tundra Toolkit.</li>
								<li>Нажмите кнопку питания в правой части окна расширения и дождитесь, пока вкладки станут доступны.</li>
								<li>Tundra Toolkit нужно включить отдельно на каждом форуме. На других сайтах и в новой вкладке браузера кнопка питания не работает.</li>
							</ol>
							<p>
								Чтобы отключить расширение на текущем форуме, снова нажмите кнопку питания.
								Стикеры, шаблоны и эпизоды не удалятся.
							</p>
						</div>

						<div className="optionsGuideBlock" id="guide-episodes">
							<h5>Эпизоды</h5>
							<p>
								На вкладке «Эпизоды» собраны активные темы с разных форумов. Здесь видны новые ответы,
								а эпизоды, в которых сейчас ваш ход, можно отметить отдельно.
							</p>
							<ul>
								<li>Откройте тему и нажмите «Текущая тема». Если тема уже добавлена, на кнопке будет надпись «Уже в избранном».</li>
								<li>Поставьте галочку слева от темы, чтобы перенести её в группу «Мой ход». Tundra Toolkit не определяет, чей сейчас ход, — отметку нужно ставить и снимать вручную.</li>
								<li>«Обновлённые» — темы с новыми ответами. «Мой ход» — темы, которые вы отметили вручную. «Жду ответа» — остальные активные эпизоды.</li>
								<li>Чтобы отметить новые ответы как просмотренные, откройте тему или нажмите метку «new».</li>
								<li>Чем больше эпизодов в списке, тем реже расширение проверяет каждый из них. Обновлять список вручную можно не чаще чем раз в 1 мин.</li>
								<li>Если вы вышли из аккаунта или форум временно недоступен, тема останется в списке с пометкой «не обновляется».</li>
								<li>Полный список и группировка по форуму или дате последнего ответа — в разделе «Настройки» → «Избранное».</li>
							</ul>
						</div>

						<div className="optionsGuideBlock" id="guide-stickers">
							<h5>Стикеры</h5>
							<p>
								Tundra Toolkit хранит ссылки на картинки, а не сами файлы. Нажмите на стикер,
								и в форму ответа вставится BBCode.
							</p>
							<ul>
								<li>Создайте стикерпак кнопкой «Новый стикерпак» и добавьте прямые ссылки на картинки — по одной на строку.</li>
								<li>Чтобы вставить стикер, откройте страницу темы с формой ответа, поставьте курсор и нажмите на картинку.</li>
								<li>Если формы ответа нет, Tundra Toolkit скопирует прямую ссылку на картинку в буфер обмена.</li>
								<li>Вверху вкладки собраны 6 недавно использованных стикеров. Этот список хранится только в текущем браузере.</li>
								<li>Порядок картинок и стикерпаков меняется в разделе «Настройки» → «Стикеры». Для стикерпаков включите «Изменить порядок» и перетащите их выше или ниже.</li>
							</ul>
						</div>

						<div className="optionsGuideBlock" id="guide-drafts">
							<h5>Черновики и шаблоны</h5>
							<p>
								На вкладке «Черновики» черновик — это текст из формы ответа, а шаблон — текст,
								который удобно использовать несколько раз. Они хранятся в одном списке.
							</p>
							<ul>
								<li>«Сохранить из формы» сохраняет текст под названием темы.</li>
								<li>«Добавить пустой» создаёт шаблон: в нём можно сохранить обычный текст, BBCode или HTML. Разметка сработает только на форумах, которые её поддерживают.</li>
								<li>«Вставить» возвращает текст в форму ответа. Если кнопка недоступна, сначала откройте страницу с формой ответа.</li>
								<li>Если черновиков и шаблонов много, с большим списком удобнее работать в разделе «Настройки» → «Черновики». После удаления восстановить запись нельзя.</li>
							</ul>
						</div>

						<div className="optionsGuideBlock" id="guide-ignore">
							<h5>Игнор-лист</h5>
							<p>
								Игнор в Tundra Toolkit не блокирует пользователя на форуме. Он скрывает выбранные
								посты и темы, а также цитаты, если удаётся распознать их автора. Изменения видны только вам.
							</p>
							<ul>
								<li>По умолчанию кнопки ⊘ скрыты. На вкладке «Игнор-лист» нажмите «Показать кнопки».</li>
								<li>Нажмите ⊘ рядом с постом, чтобы скрыть пользователя только в выбранном разделе: например, во флуде, но не в игровом разделе.</li>
								<li>На странице раздела или в результатах поиска нажмите ⊘ рядом с темой. Она скроется из списков только у вас и останется доступна по прямой ссылке.</li>
								<li>Кнопка с глазом временно показывает весь скрытый контент. Записи в «Игнор-листе» при этом не удаляются. Скрытое вернётся после обновления страницы или повторного нажатия.</li>
								<li>Чтобы убрать пользователя или тему из игнора, откройте «Настройки» → «Чёрный список» и нажмите крестик рядом с записью.</li>
							</ul>
						</div>

						<div className="optionsGuideBlock" id="guide-counter">
							<h5>Счётчик постов</h5>
							<p>
								Счётчик поможет подвести итоги эпизода, события или игрового периода.
								Запустите его из окна расширения на форуме, где включён Tundra Toolkit.
							</p>
							<ul>
								<li>В поле «Форумы» выберите один или несколько разделов, в поле «Пользователи» — аккаунты персонажей. Искать можно по названию, нику или ID.</li>
								<li>Задайте период в полях «С» и «По». Если нужно, включите «считать количество символов в постах» и нажмите «Считать».</li>
								<li>Чем больше разделов и чем длиннее период, тем дольше идёт подсчёт. Не закрывайте страницу до завершения.</li>
								<li>После подсчёта включите «показать BBCode», скопируйте текст и вставьте его в банк, игровой отчёт или другое сообщение на форуме.</li>
							</ul>
						</div>

						<div className="optionsGuideBlock" id="guide-style">
							<h5>Стиль</h5>
							<p>
								На вкладке «Стиль» можно упростить оформление форума, изменить размер текста,
								настроить красную строку и интервалы между абзацами. Настройки сохраняются
								отдельно для каждого форума.
							</p>
							<ul>
								<li>«SFW-стиль» уменьшает аватары и скрывает подписи, личные звания, шапку, подвал, объявления и часть декоративных изображений. Он меняет только оформление и не проверяет содержимое постов, поэтому нежелательный контент, в том числе 18+, может остаться видимым.</li>
								<li>Кнопки − и + в блоке «Размер шрифта постов» меняют масштаб. Нажмите на значение в процентах, чтобы вернуть 100%. Если форум сам задаёт размер шрифта, текст в некоторых элементах может не измениться.</li>
								<li>«Красная строка» настраивается отдельно для каждого раздела. Кнопками − и + задайте «Отступ между абзацами»; нажмите на значение, чтобы вернуть «Авто».</li>
							</ul>
						</div>

						<div className="optionsGuideBlock" id="guide-settings">
							<h5>Настройки</h5>
							<p>
								Шестерёнка в окне расширения открывает настройки в отдельной вкладке.
								Индикатор «Память Chrome» слева показывает, сколько места занято в Chrome Sync.
							</p>
							<ul>
								<li>«Стикеры» — добавлять, редактировать, удалять и менять порядок стикерпаков и картинок.</li>
								<li>«Черновики» — редактировать названия и содержимое черновиков и шаблонов.</li>
								<li>«Чёрный список» — удалять пользователей и темы из игнора.</li>
								<li>«Избранное» — группировать эпизоды по форуму или дате последнего ответа и удалять ненужные.</li>
							</ul>
						</div>

						<div className="optionsGuideBlock" id="guide-sync">
							<h5>Где хранятся данные</h5>
							<p>
								Tundra Toolkit сохраняет данные в текущем браузере. Если в Chrome Sync хватает места,
								часть из них может синхронизироваться с другими устройствами с тем же профилем Chrome.
								Для данных расширения доступно около 100 КБ: тексты черновиков, ссылки на картинки
								и записи о темах и пользователях. Сами изображения из стикерпаков в Chrome Sync не загружаются.
							</p>
							<ul>
								<li>Обычное облако — элемент хранится в Chrome Sync. Нажмите метку, чтобы оставить его только в этом браузере.</li>
								<li>Перечёркнутое облако — элемент есть только в этом браузере. Нажмите метку, чтобы попробовать добавить его в Chrome Sync.</li>
								<li>Облако с предупреждением — в Chrome Sync не хватило места. Элемент остался в этом браузере. Освободите место и нажмите метку ещё раз.</li>
							</ul>
							<p>
								Если места не хватает, данные не удаляются: они остаются в текущем браузере.
								На других устройствах их не будет. Они могут исчезнуть, если вы очистите данные браузера,
								удалите профиль или само расширение. Chrome Sync — не резервная копия.
								Важные тексты сохраняйте отдельно.
							</p>
						</div>

						<div className="optionsGuideBlock optionsGuideWarning">
							<h5>Безопасность и приватность</h5>
							<ul>
								<li>Включайте Tundra Toolkit только на форумах, которым доверяете.</li>
								<li>Не храните в черновиках пароли, токены доступа, резервные коды, платёжные и паспортные данные или приватные переписки.</li>
								<li>Любой человек с доступом к вашему профилю браузера сможет увидеть данные Tundra Toolkit на этом устройстве.</li>
								<li>Стикеры загружаются по ссылкам, которые вы добавили. Храните изображения на надёжном сервисе, который даёт прямые ссылки.</li>
								<li>SFW-стиль не фильтрует содержимое постов — он меняет только оформление.</li>
							</ul>
						</div>

						<div className="optionsGuideBlock" id="guide-faq">
							<h5>Частые вопросы</h5>
							<dl className="optionsGuideFaq">
								<dt>Почему часть вкладок недоступна?</dt>
								<dd>Некоторые вкладки доступны только на страницах форума. Откройте форум MyBB/RusFF и включите Tundra Toolkit кнопкой питания.</dd>
								<dt>Почему кнопка «Текущая тема» не нажимается?</dt>
								<dd>Кнопка работает только на странице темы. Если тема уже добавлена, на кнопке будет написано «Уже в избранном».</dd>
								<dt>Почему эпизод помечен «не обновляется»?</dt>
								<dd>Так бывает, если вы вышли из аккаунта на форуме или сам форум временно недоступен. Откройте форум, войдите в аккаунт и попробуйте обновить список позже.</dd>
								<dt>Почему стикер не вставился в сообщение?</dt>
								<dd>Откройте страницу с формой ответа. Если формы нет, Tundra Toolkit скопирует ссылку на картинку в буфер обмена — вставьте её вручную.</dd>
								<dt>Куда пропали кнопки ⊘?</dt>
								<dd>Откройте «Игнор-лист» и нажмите «Показать кнопки».</dd>
								<dt>Как посмотреть скрытое, ничего не удаляя?</dt>
								<dd>На вкладке «Игнор-лист» нажмите кнопку с глазом. Скрытые посты и темы снова появятся. Они останутся видимыми до обновления страницы или повторного нажатия, а записи в игноре не удалятся.</dd>
								<dt>Почему счётчик работает долго?</dt>
								<dd>Счётчик проверяет темы по очереди. Чем больше разделов и пользователей вы выбрали и чем длиннее период, тем дольше идёт подсчёт. Не закрывайте страницу до завершения.</dd>
								<dt>Почему данные есть на одном устройстве, но нет на другом?</dt>
								<dd>Проверьте метку облака рядом с элементом. Перечёркнутое облако означает, что элемент хранится только в этом браузере. Облако с предупреждением показывает, что в Chrome Sync не хватило места. Освободите место и нажмите метку ещё раз.</dd>
								<dt>Исчезнут ли данные, если выключить расширение на форуме?</dt>
								<dd>Нет. Кнопка питания только отключает Tundra Toolkit на текущем форуме и не удаляет данные. Стикеры, шаблоны, эпизоды и записи в игноре сохранятся.</dd>
								<dt>Работает ли Tundra Toolkit на любом форуме?</dt>
								<dd>Tundra Toolkit работает с форумами MyBB/RusFF. На форумах с другими движками расширение может работать неправильно или не работать совсем.</dd>
							</dl>
						</div>

						<div className="optionsGuideBlock">
							<h5>Если нужна помощь</h5>
							<p>
								Если что-то не работает, напишите разработчику и укажите ссылку на форум или страницу,
								что вы сделали, что произошло и что ожидали увидеть, а также скриншот окна расширения
								или сообщения об ошибке — без личных данных.
							</p>
							<p>
								Написать разработчику: <a href="https://t.me/hvscripts" target="_blank" rel="noreferrer">Telegram — hvscripts</a>.
							</p>
						</div>
					</section>
				);
			case 'templates':
				return <TemplateOptions />;
			case 'blackList':
				return <BlackListOptions />;
			case 'favorites':
				return <FavoritesOptions />;
			case 'stickers':
			default:
				return <StickerPackOptions />;
		}
	};

	return (
		<div class="wrapper">
			<header>
				<div className="main">
					<div className="logo">
						<img src='./icon512.png' alt="" />
					</div>
					<div>
						<h1>Tundra Toolkit <span>v3.2</span></h1>
						<div className="headerMeta">Привычные инструменты — на любом поддерживаемом форуме MyBB/RusFF. От <a href="https://t.me/hvscripts" target="_blank" rel="noreferrer">Человека-Шамана</a>.</div>
					</div>
				</div>
			</header>
			<main>
				<div className="optionsLayout">
					<aside className="optionsSidebar">
						<nav className="optionsNav">
							{ sections.map(section => {
								const localOnly = isSectionLocal(section.id, storageFallbacks);
								return (
									<button
										key={ section.id }
										className={ `button outline optionsNavItem ${ activeSection === section.id ? 'active' : '' }` }
										onClick={ () => selectSection(section.id) }
									>
										<span className="optionsNavItemLabel">{ section.label }</span>
										{ localOnly && (
											<span
												className="storageLocalBadge"
												title="Сохранено только в этом браузере"
											>
												локально
											</span>
										) }
									</button>
								);
							}) }
						</nav>
						<div className="storageUsageCard">
							<div className="storageUsageTitle">Память Chrome</div>
							{ syncUsageError ? (
								<div className="text-error">{ syncUsageError }</div>
							) : (
								<>
									<div
										className="storageUsageBar"
										role="progressbar"
										aria-valuemin={ 0 }
										aria-valuemax={ 100 }
										aria-valuenow={ syncUsagePercent }
									>
										<div
											className={ `storageUsageFill ${ syncUsagePercent >= 90 ? 'danger' : syncUsagePercent >= 75 ? 'warn' : '' }` }
											style={{ width: `${ syncUsagePercent }%` }}
										/>
									</div>
									<div className="storageUsageMeta text-secondary">
										{ syncBytesInUse === null
											? 'Загрузка...'
											: `${ (syncBytesInUse / 1024).toFixed(1) } KB из ${ (syncQuotaBytes / 1024).toFixed(0) } KB (${ syncUsagePercent }%)` }
									</div>
								</>
							) }
						</div>
						<button
							className={ `optionsGuideLink ${ activeSection === 'guide' ? 'active' : '' }` }
							onClick={ () => selectSection('guide') }
						>
							Инструкция по расширению
						</button>
					</aside>
					<div className="optionsContent">
						{ activeSectionIsLocal && activeSection !== 'stickers' && activeSection !== 'templates' && (
							<div className="storageLocalNotice" role="status">
								<span className="storageLocalBadge">локально</span>
								<span>Эти данные сохранены только в этом браузере и не синхронизируются через Chrome Sync.</span>
							</div>
						) }
						{ renderSection() }
					</div>
				</div>
			</main>
		</div>
	);
}

const root = document.getElementById('app');
if (root) {
	render(<App />, root);
}
