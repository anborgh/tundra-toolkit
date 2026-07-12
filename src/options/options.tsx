import { render } from 'preact';
import { useEffect, useMemo, useState } from 'react';

import { BlackListOptions } from './blackListOptions';
import StickerPackOptions from './stickerPackOptions';
import { ConflictResolver } from './conflictResolver';
import TemplateOptions from './templateOptions';
import { FavoritesOptions } from './favoritesOptions';

import '../chota.min.css';
import '../common.css';
import './options.css';

type SettingsSection = 'stickers' | 'templates' | 'blackList' | 'favorites' | 'guide';

export function App() {
	const [ activeSection, setActiveSection ] = useState<SettingsSection>('stickers');
	const [ syncBytesInUse, setSyncBytesInUse ] = useState<number | null>(null);
	const [ syncUsageError, setSyncUsageError ] = useState<string | null>(null);

	const syncQuotaBytes = chrome.storage?.sync?.QUOTA_BYTES || 102400;
	const syncUsagePercent = useMemo(() => {
		if (syncBytesInUse === null) return 0;
		return Math.min(100, Math.round((syncBytesInUse / syncQuotaBytes) * 100));
	}, [ syncBytesInUse, syncQuotaBytes ]);

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

		updateSyncUsage();

		const handleStorageChange = (_changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
			if (areaName !== 'sync') return;
			updateSyncUsage();
		};

		chrome.storage.onChanged.addListener(handleStorageChange);
		return () => chrome.storage.onChanged.removeListener(handleStorageChange);
	}, []);

	const sections: {
		id: SettingsSection;
		label: string;
	}[] = [
		{ id: 'stickers', label: 'Стикеры' },
		{ id: 'templates', label: 'Черновики' },
		{ id: 'blackList', label: 'Черный список' },
		{ id: 'favorites', label: 'Избранное' },
	];

	const renderSection = () => {
		switch (activeSection) {
			case 'guide':
				return (
					<section className="optionsGuide">
						<h3>Инструкция по расширению</h3>
						<p className="text-secondary">
							Tundra Toolkit добавляет к привычному форуму несколько удобных инструментов:
							стикеры, черновики, избранные эпизоды, личный игнор и счётчик постов.
							Если вы уже пользуетесь форумами MyBB/RusFF, всё основное будет знакомо:
							расширение просто помогает меньше искать руками и меньше держать в голове.
						</p>

						<div className="optionsGuideBlock">
							<h5>Первый запуск</h5>
							<ul>
								<li>Откройте нужный форум и нажмите на иконку Tundra Toolkit.</li>
								<li>Если расширение распознало форум, включите его для этого сайта кнопкой питания.</li>
								<li>После включения станут доступны кнопки игнора, избранное, счётчик постов и вставка в форму ответа.</li>
								<li>Расширение работает только на форумах, которым вы сами доверили доступ.</li>
							</ul>
						</div>

						<div className="optionsGuideBlock">
							<h5>Стикеры</h5>
							<ul>
								<li>Создайте один или несколько стикерпаков и добавьте туда ссылки на картинки.</li>
								<li>В попапе выберите нужную картинку: на форуме она вставится в поле ответа как изображение.</li>
								<li>Если вы открыли стикеры не на странице ответа, ссылка на картинку скопируется в буфер обмена.</li>
								<li>Порядок стикеров можно менять, чтобы часто используемые были под рукой.</li>
							</ul>
						</div>

						<div className="optionsGuideBlock">
							<h5>Черновики и шаблоны</h5>
							<ul>
								<li>Сохраняйте оформления, заготовки постов, шаблоны анкет и другие повторяющиеся тексты.</li>
								<li>Кнопка «Сохранить из формы» забирает текущий текст из поля ответа.</li>
								<li>Кнопка «Вставить» возвращает выбранный шаблон обратно в поле ответа.</li>
								<li>Это удобно для черновиков, но не используйте расширение как хранилище секретной информации.</li>
							</ul>
						</div>

						<div className="optionsGuideBlock">
							<h5>Игнор</h5>
							<ul>
								<li>На странице темы можно скрыть посты конкретного пользователя в выбранном разделе.</li>
								<li>На странице раздела или поиска можно скрывать отдельные темы.</li>
								<li>Игнор работает только для вас: форум и другие пользователи ничего не меняют.</li>
								<li>Если нужно вернуть скрытое, откройте настройки и удалите пользователя или тему из списка.</li>
							</ul>
						</div>

						<div className="optionsGuideBlock">
							<h5>Избранное</h5>
							<ul>
								<li>Откройте тему и нажмите «+ Текущая тема», чтобы добавить её в список эпизодов.</li>
								<li>В список можно добавлять темы с разных форумов: всё будет собрано в одном месте.</li>
								<li>Расширение проверяет новые сообщения в фоне и показывает счётчик в попапе и на иконке.</li>
								<li>Отметьте галочкой темы, где сейчас ваш ход, чтобы они не терялись среди остальных.</li>
								<li>Если на каком-то форуме вы не авторизованы, тема останется в списке, но будет помечена как «не обновляется».</li>
							</ul>
						</div>

						<div className="optionsGuideBlock">
							<h5>Счётчик постов</h5>
							<ul>
								<li>Откройте форум, включите расширение для этого сайта и запустите счётчик из попапа.</li>
								<li>Укажите ID разделов, ID пользователей и период, за который нужно собрать статистику.</li>
								<li>Расширение пройдётся по темам, посчитает найденные посты и покажет ссылки на них.</li>
								<li>Функция может работать небыстро на больших разделах: это нормально, особенно если тем много.</li>
							</ul>
						</div>

						<div className="optionsGuideBlock optionsGuideWarning">
							<h5>Важно для безопасности</h5>
							<p>
								Не храните в расширении пароли, токены доступа, резервные коды, приватные переписки,
								паспортные, платёжные и другие чувствительные данные. Стикеры, черновики, шаблоны,
								избранное и списки игнора могут синхронизироваться через Chrome или сохраняться
								локально на устройстве, поэтому добавляйте только то, что не страшно потерять или
								случайно открыть на своём браузере.
							</p>
						</div>

						<div className="optionsGuideBlock">
							<h5>Синхронизация и память</h5>
							<ul>
								<li>По возможности данные сохраняются в Chrome Sync, чтобы быть доступными в вашем браузере на разных устройствах.</li>
								<li>Если места в Chrome Sync не хватает, расширение сохранит часть данных локально только на этом устройстве.</li>
								<li>Индикатор слева показывает, сколько места уже занято в синхронизируемом хранилище.</li>
							</ul>
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
						<img src='./icon512.png' />
					</div>
					<h1>Tundra Toolkit <span>v3.2</span></h1>
					<div>Набор инструментов от <a href="https://t.me/hvscripts" target="_blank">Человека-Шамана</a>.</div>
				</div>
			</header>
			<main>
				<ConflictResolver />
				<div className="optionsLayout">
					<aside className="optionsSidebar">
						<nav className="optionsNav">
							{ sections.map(section => (
								<button
									key={ section.id }
									className={ `button outline optionsNavItem ${ activeSection === section.id ? 'active' : '' }` }
									onClick={ () => setActiveSection(section.id) }
								>
									{ section.label }
								</button>
							)) }
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
							onClick={ () => setActiveSection('guide') }
						>
							Инструкция по расширению
						</button>
					</aside>
					<div className="optionsContent">
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
