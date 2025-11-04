
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";

import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Glossary from "./pages/Glossary";

function App() {
  return (
    <Router>
      {/* Navbar */}
      <Navbar />

      {/* Page Content */}
      <div className="app-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/glossary" element={<Glossary />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;

