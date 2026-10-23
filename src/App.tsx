import { ThemeProvider } from "./contexts/ThemeContext";
import { MainLayout } from "./components/Layout/MainLayout";
import "./styles/theme.css";
import "./App.css";

function App() {
  return (
    <ThemeProvider>
      <MainLayout />
    </ThemeProvider>
  );
}

export default App;
