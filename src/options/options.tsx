import { render } from 'preact';
import { useEffect, useMemo, useState } from 'react';

import { BlackListOptions } from './blackListOptions';
import StickerPackOptions from './stickerPackOptions';
import { ConflictResolver } from './conflictResolver';
import TemplateOptions from './templateOptions';

import '../chota.min.css';
import '../common.css';
import './options.css';

type SettingsSection = 'stickers' | 'templates' | 'blackList' | 'guide';

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
	];

	const renderSection = () => {
		switch (activeSection) {
			case 'guide':
				return (
					<section className="optionsGuide">
						<h3>Инструкция по расширению</h3>
						<p className="text-secondary">
							Tundra Toolkit упрощает работу с форумом: хранит ваши черновики и шаблоны, собирает в одном месте все ваши стикеры, позволяет скрывать неприятный контент.
						</p>

						<div className="optionsGuideBlock">
							<h5>Стикеры</h5>
							<ul>
								<li>Создавайте наборы стикеров и добавляйте изображения по ссылкам.</li>
								<li>Перетаскивайте стикеры для сортировки внутри набора.</li>
								<li>Используйте наборы в попапе, чтобы быстро вставлять изображения в поле ответа.</li>
								<li>При использовании вне форумов Mybb&Co, расширение копирует адрес изображения в буфер обмена.</li>
							</ul>
						</div>

						<div className="optionsGuideBlock">
							<h5>Черновики</h5>
							<ul>
								<li>Сохраняйте универсальные шаблоны текста для повторяющихся ответов или шаблона оформления эпизода.</li>
								<li>Забирайте текущий текст из формы ответа в один клик.</li>
								<li>Сохраняйте в памяти Chrome недописанные посты.</li>
							</ul>
						</div>

						<div className="optionsGuideBlock">
							<h5>Чёрный список</h5>
							<ul>
								<li>Игнорируйте отдельных пользователей на выбранных форумах.</li>
								<li>Скрывайте целые темы из списка при просмотре форумов и поиска по темам.</li>
								<li>При необходимости быстро возвращайте пользователей и темы обратно.</li>
							</ul>
						</div>

						<div className="optionsGuideBlock">
							<h5>Счётчик постов</h5>
							<ul>
								<li>Запускается с форума через пункт <code>TT: Счётчик постов</code> в профиле пользователя на форуме.</li>
								<li>Собирает посты пользователей в выбранных разделах форума.</li>
								<li>Показывает статистику по объёму сообщений и ссылки на найденные посты.</li>
							</ul>
						</div>

						<div className="optionsGuideBlock">
							<h5>Синхронизация и память</h5>
							<ul>
								<li>Данные сохраняются в Chrome Sync для работы на нескольких устройствах.</li>
								<li>Если лимит Sync переполнен, расширение автоматически использует локальное хранилище.</li>
								<li>Слева отображается текущая загрузка памяти, чтобы заранее контролировать объём данных.</li>
							</ul>
						</div>
					</section>
				);
			case 'templates':
				return <TemplateOptions />;
			case 'blackList':
				return <BlackListOptions />;
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
					<h1>Tundra Toolkit <span>v3.0-alpha</span></h1>
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

render(<App />, document.getElementById('app'));
