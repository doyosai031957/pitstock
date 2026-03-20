export interface User {
  id: string;
  password: string;
  name: string;
}

// 관리자가 이 배열을 편집하여 계정을 관리합니다
export const USERS: User[] = [
  { id: "mic", password: "1234", name: "사용자1" },
  { id: "dora", password: "1234", name: "사용자2" },
];
