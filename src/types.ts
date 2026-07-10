interface IBoardStore {
  boardID: string;
  boardName: string;
  boardUrl: string;
  forums: IForumStore[];
}

interface IForumStore {
  forumID: string;
  forumName: string;
  users: IUserStore[];
}

interface IUserStore {
  userID: string;
  userName: string;
  updatedAt?: number;
}

interface ITopicStore {
  topicID: string;
  topicName: string;
  updatedAt?: number;
}

interface IBoardTopicsStore {
  boardID: string;
  boardName: string;
  boardUrl: string;
  topics: ITopicStore[];
}

interface IStickerPack {
  id: number,
  name: string,
  items: string[],
  updatedAt?: number,
}

interface ITemplate {
  id: number,
  name: string,
  content: string,
  updatedAt?: number,
}